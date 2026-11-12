import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../../src/features/common-ground/api';
import {
  mergeBusy,
  reconcile,
  setDevice,
  syncCalendar,
  wipeCalendar,
} from '../../src/features/common-ground/calendar';
import { getState, setState, setStorage } from '../../src/features/common-ground/store';
import type { CalendarDirective, CalendarSync } from '../../src/features/common-ground/types';

setStorage({ read: async () => null, write: async () => {}, remove: async () => {} });

const ops: string[] = [];
let next = 0;
setDevice({
  permission: async () => true,
  ensure: async () => 'cal_cg',
  // Extra fields a device might carry must never leave it (C7).
  busy: async () =>
    [
      { start: '2026-11-14T10:00:00Z', end: '2026-11-14T11:00:00Z', title: 'Dentist' },
      { start: '2026-11-14T10:30:00Z', end: '2026-11-14T12:00:00Z', notes: 'x' },
    ] as never,
  save: async (calendarId, eventId, d) => {
    assert.equal(calendarId, 'cal_cg', 'writes only to our calendar');
    ops.push(`save:${eventId ?? 'new'}:${d.desired}:${d.startsAt}`);
    return eventId ?? `ev_${++next}`;
  },
  remove: async (id) => void ops.push(`remove:${id}`),
});
const dir = (desired: CalendarDirective['desired'], startsAt = '2026-11-14T18:00:00Z') => ({
  key: 'mt_1',
  desired,
  title: 'Wheel-throwing drop-in',
  startsAt,
  endsAt: '2026-11-14T20:00:00Z',
});

test('mergeBusy merges overlaps and keeps only start and end', () => {
  assert.deepEqual(
    mergeBusy([
      { start: '2026-11-14T13:00:00Z', end: '2026-11-14T14:00:00Z' },
      { start: '2026-11-14T10:00:00Z', end: '2026-11-14T11:00:00Z', title: 'x' } as never,
      { start: '2026-11-14T10:30:00Z', end: '2026-11-14T12:00:00Z' },
    ]),
    [
      { start: '2026-11-14T10:00:00Z', end: '2026-11-14T12:00:00Z' },
      { start: '2026-11-14T13:00:00Z', end: '2026-11-14T14:00:00Z' },
    ],
  );
});

test('reconcile: hold -> event -> moved -> none, unchanged skipped, outcome reported', async () => {
  setState({ calendar: { id: 'cal_cg', events: {}, applied: [] } });
  assert.equal(await reconcile([dir('hold')]), true);
  assert.equal(await reconcile([dir('hold')]), false, 'unchanged is a no-op');
  await reconcile([dir('event')]);
  await reconcile([dir('event', '2026-11-14T19:00:00Z')]);
  await reconcile([dir('none')]);
  assert.equal(await reconcile([dir('none')]), false);
  assert.deepEqual(ops, [
    'save:new:hold:2026-11-14T18:00:00Z',
    'save:ev_1:event:2026-11-14T18:00:00Z',
    'save:ev_1:event:2026-11-14T19:00:00Z',
    'remove:ev_1',
  ]);
  assert.deepEqual(getState().calendar.applied, [{ key: 'mt_1', desired: 'none', ok: true }]);
});

test('syncCalendar sends only start/end busy blocks plus applied, then reconciles and reports', async () => {
  ops.length = 0;
  setState({
    calendar: { id: 'cal_cg', events: {}, applied: [] },
    me: { optedIn: true } as never,
    config: { limits: { calendarSyncMinIntervalS: 300, calendarHorizonDays: 14 } } as never,
  });
  const sent: CalendarSync[] = [];
  const real = api.syncCalendar;
  api.syncCalendar = async (body) => {
    sent.push(structuredClone(body));
    return { acceptedBusy: body.busy.length, directives: [dir('event')] };
  };
  await syncCalendar(true);
  await syncCalendar(); // throttled by calendarSyncMinIntervalS
  api.syncCalendar = real;
  assert.equal(sent.length, 2, 'one sync plus one immediate report');
  assert.deepEqual(sent[0]!.busy, [{ start: '2026-11-14T10:00:00Z', end: '2026-11-14T12:00:00Z' }]);
  assert.deepEqual(sent[1]!.applied, [{ key: 'mt_1', desired: 'event', ok: true }]);
  assert.deepEqual(getState().calendar.applied, []);
  await wipeCalendar();
  assert.equal(ops.at(-1), 'remove:ev_2');
});
