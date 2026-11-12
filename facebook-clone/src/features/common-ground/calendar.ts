// Device calendar (PRD-1 §5.1, C7). Reads only start/end of busy events outside our own calendar;
// writes only to the "Common Ground" calendar the app created, and only what directives say.
// expo-calendar is required lazily (feature.ts and Node tests stay free of native modules).
import { api } from './api';
import { hooks } from './realtime';
import { connect, getState, setState, subscribe } from './store';
import type { BusyBlock, CalendarApplied, CalendarDirective } from './types';

export interface DeviceCalendar {
  permission(): Promise<boolean>;
  ensure(id: string | null): Promise<string>; // our calendar's ID, created once
  busy(from: Date, to: Date, exceptId: string): Promise<BusyBlock[]>; // start and end only
  save(calendarId: string, eventId: string | null, d: CalendarDirective): Promise<string>;
  remove(eventId: string): Promise<void>;
}

function expoCalendar(): DeviceCalendar | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, loaded on device only.
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS === 'web') return null; // D5: no-op on web
    // `/legacy`: the default export is Calendar@next, which Expo Go stubs out.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above.
    const C = require('expo-calendar/legacy') as typeof import('expo-calendar/legacy');
    const details = (d: CalendarDirective) => ({
      title: d.title,
      startDate: new Date(d.startsAt),
      endDate: new Date(d.endsAt),
      location: d.location ?? undefined,
      notes: d.notes ?? undefined,
    });
    return {
      permission: async () => (await C.requestCalendarPermissionsAsync()).granted,
      ensure: async (id) => {
        const all = await C.getCalendarsAsync(C.EntityTypes.EVENT);
        if (id && all.some((c) => c.id === id)) return id;
        const { source } = await C.getDefaultCalendarAsync();
        return C.createCalendarAsync({
          title: 'Common Ground',
          name: 'Common Ground',
          color: '#1877F2',
          entityType: C.EntityTypes.EVENT,
          sourceId: source.id,
          source,
          ownerAccount: 'personal',
          accessLevel: C.CalendarAccessLevel.OWNER,
        });
      },
      busy: async (from, to, exceptId) => {
        const ids = (await C.getCalendarsAsync(C.EntityTypes.EVENT))
          .map((c) => c.id)
          .filter((id) => id !== exceptId);
        if (!ids.length) return [];
        const events = await C.getEventsAsync(ids, from, to);
        return events.map((e) => ({
          start: new Date(e.startDate).toISOString(),
          end: new Date(e.endDate).toISOString(),
        }));
      },
      save: async (calendarId, eventId, d) => {
        if (eventId)
          try {
            return await C.updateEventAsync(eventId, details(d));
          } catch {
            // deleted by the user: create it again
          }
        return C.createEventAsync(calendarId, details(d));
      },
      remove: (eventId) => C.deleteEventAsync(eventId),
    };
  } catch {
    return null; // Node tests, or the module is missing
  }
}
let device: DeviceCalendar | null | undefined;
export const setDevice = (next: DeviceCalendar | null): void => void (device = next);
const dev = () => (device === undefined ? (device = expoCalendar()) : device);

// Sorted, overlapping or touching blocks merged.
export function mergeBusy(blocks: BusyBlock[]): BusyBlock[] {
  const out: BusyBlock[] = [];
  for (const b of [...blocks].sort((x, y) => x.start.localeCompare(y.start))) {
    const last = out.at(-1);
    if (last && b.start <= last.end) last.end = b.end > last.end ? b.end : last.end;
    else out.push({ start: b.start, end: b.end });
  }
  return out;
}

const sig = (d: CalendarDirective) =>
  d.desired === 'none'
    ? 'none'
    : [d.desired, d.title, d.startsAt, d.endsAt, d.location ?? '', d.notes ?? ''].join('|');

// Serialized so two reconciles never race on the same event. Returns whether anything changed
// (so the outcome needs reporting). Unchanged directives are skipped by signature.
let chain: Promise<unknown> = Promise.resolve();
export function reconcile(directives: CalendarDirective[]): Promise<boolean> {
  const run = chain.then(async () => {
    const d = dev();
    const cal = getState().calendar;
    if (!d || !cal.id) return false;
    const events = { ...cal.events };
    let applied: CalendarApplied[] = [...cal.applied];
    const last = new Map(directives.map((x) => [x.key, x])); // last one per key wins
    let changed = false;
    for (const x of last.values()) {
      const cur = events[x.key];
      if (cur?.sig === sig(x)) continue;
      let ok = true;
      try {
        if (x.desired === 'none') {
          if (cur?.eventId) await d.remove(cur.eventId);
          events[x.key] = { eventId: '', sig: 'none' };
        } else {
          events[x.key] = { eventId: await d.save(cal.id, cur?.eventId || null, x), sig: sig(x) };
        }
      } catch {
        ok = false; // no signature stored, so the next reconcile retries
      }
      applied = [...applied.filter((a) => a.key !== x.key), { key: x.key, desired: x.desired, ok }];
      changed = true;
    }
    setState({ calendar: { ...getState().calendar, events, applied } });
    return changed;
  });
  chain = run.catch(() => {});
  return run;
}

let lastSync = 0;
let syncing: Promise<void> | null = null;
// Read busy blocks, report `applied`, reconcile the returned directives, and report once more
// right away if that changed anything (bounded to two rounds).
export function syncCalendar(force = false): Promise<void> {
  const s = getState();
  const d = dev();
  const conn = s.connectors.find((c) => c.provider === 'device_calendar');
  if (!d || !s.calendar.id || !s.config || !s.me?.optedIn || (conn && conn.status !== 'connected'))
    return Promise.resolve();
  const limits = s.config.limits;
  if (!force && Date.now() - lastSync < limits.calendarSyncMinIntervalS * 1000)
    return Promise.resolve();
  return (syncing ??= (async () => {
    try {
      lastSync = Date.now();
      for (let round = 0; round < 2; round++) {
        const cal = getState().calendar;
        const from = new Date();
        const to = new Date(from.getTime() + limits.calendarHorizonDays * 86_400_000);
        const sent = cal.applied;
        const res = await api.syncCalendar({
          source: 'device_calendar',
          horizonStart: from.toISOString(),
          horizonEnd: to.toISOString(),
          busy: mergeBusy(await d.busy(from, to, cal.id!)),
          applied: sent,
        });
        const now = getState().calendar;
        setState({ calendar: { ...now, applied: now.applied.filter((a) => !sent.includes(a)) } });
        if (!(await reconcile(res.directives))) break;
      }
    } catch {
      // offline: the next foreground or event retries
    } finally {
      syncing = null;
    }
  })());
}

// The "Calendar on this iPhone" toggle (slice B calls this instead of store.connect).
export async function connectDeviceCalendar(): Promise<boolean> {
  const d = dev();
  if (!d || !(await d.permission().catch(() => false))) return false;
  if (!(await connect('device_calendar'))) return false;
  const id = await d.ensure(getState().calendar.id).catch(() => null);
  if (!id) return false;
  setState({ calendar: { ...getState().calendar, id } });
  await syncCalendar(true);
  return true;
}

// Reset hook: delete our events, forget the map.
export async function wipeCalendar(): Promise<void> {
  const d = dev();
  const events = Object.values(getState().calendar.events);
  if (d) await Promise.all(events.map((e) => e.eventId && d.remove(e.eventId).catch(() => {})));
}

// Directives the store already holds (Join.calendar, Meetup.calendar).
const held = () => {
  const s = getState();
  return [
    ...s.joins.map((j) => j.calendar),
    ...Object.values(s.meetups).map((m) => m.calendar),
  ].filter((x): x is CalendarDirective => !!x);
};
let started = false;
export function startCalendar(): void {
  if (started) return;
  started = true;
  hooks.calendarChanged = () => syncCalendar();
  let joins = getState().joins;
  let meetups = getState().meetups;
  subscribe(() => {
    const s = getState();
    if (s.joins === joins && s.meetups === meetups) return;
    ({ joins, meetups } = s);
    void reconcile(held()).then((changed) => (changed ? syncCalendar(true) : undefined));
  });
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- keep react-native out of Node tests.
    const { AppState } = require('react-native') as typeof import('react-native');
    AppState.addEventListener('change', (next) => next === 'active' && void syncCalendar());
  } catch {
    // Node tests
  }
  void syncCalendar();
}
