// Leave-by local notifications (PRD-1 §5.2). Local only: never asks for a push token.
// Permission is requested the first time one is needed, not at launch.
import { getState, setState, subscribe } from './store';
import type { Meetup } from './types';

export interface Notifier {
  permission(): Promise<boolean>;
  schedule(at: Date, title: string, body: string, meetupId: string): Promise<string>;
  cancel(id: string): Promise<void>;
}

function expoNotifier(): Notifier | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, loaded on device only.
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS === 'web') return null; // D5: no-op on web
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above.
    const N = require('expo-notifications') as typeof import('expo-notifications');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above.
    const { router } = require('expo-router') as typeof import('expo-router');
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    // Tap -> the meetup with Directions focused (slice C reads `?directions=1`).
    N.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.content.data?.meetupId;
      if (typeof id === 'string') router.push(`/common-ground/meetup/${id}?directions=1`);
    });
    return {
      permission: async () =>
        (await N.getPermissionsAsync()).granted || (await N.requestPermissionsAsync()).granted,
      schedule: (at, title, body, meetupId) =>
        N.scheduleNotificationAsync({
          content: { title, body, data: { meetupId } },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: at },
        }),
      cancel: (id) => N.cancelScheduledNotificationAsync(id),
    };
  } catch {
    return null; // Node tests
  }
}
let notifier: Notifier | null | undefined;
export const setNotifier = (next: Notifier | null): void => void (notifier = next);
const dev = () => (notifier === undefined ? (notifier = expoNotifier()) : notifier);

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
// Which meetups want a reminder now: confirmed, I'm going, leave-by still ahead.
export function wanted(meetups: Meetup[], on: boolean, now = Date.now()) {
  const out: Record<string, { at: string; title: string; body: string }> = {};
  if (!on) return out;
  for (const m of meetups) {
    const going = m.attendees.find((a) => a.isMe)?.rsvp === 'going';
    if (m.status !== 'confirmed' || !going || !m.travel || Date.parse(m.travel.leaveBy) <= now)
      continue;
    out[m.meetupId] = {
      at: m.travel.leaveBy,
      title: m.title,
      body: `Leave by ${time(m.travel.leaveBy)} for ${m.venue.name} · ${m.travel.label}`,
    };
  }
  return out;
}

let chain: Promise<unknown> = Promise.resolve();
// Schedule, move (reschedule) or cancel (left, cancelled, setting off) to match `wanted`.
export function reconcileReminders(): Promise<void> {
  const run = chain.then(async () => {
    const n = dev();
    const s = getState();
    if (!n) return;
    const want = wanted(Object.values(s.meetups), !!s.me?.museSettings.leaveByReminders);
    const have = { ...s.reminders };
    for (const [id, r] of Object.entries(have))
      if (want[id]?.at !== r.at) {
        await n.cancel(r.id).catch(() => {});
        delete have[id];
      }
    const todo = Object.entries(want).filter(([id]) => !have[id]);
    if (todo.length && (await n.permission().catch(() => false)))
      for (const [id, w] of todo)
        have[id] = { id: await n.schedule(new Date(w.at), w.title, w.body, id), at: w.at };
    setState({ reminders: have });
  });
  chain = run.catch(() => {});
  return run;
}

export async function cancelReminders(): Promise<void> {
  const n = dev();
  if (n)
    await Promise.all(
      Object.values(getState().reminders).map((r) => n.cancel(r.id).catch(() => {})),
    );
}

let started = false;
export function startReminders(): void {
  if (started) return;
  started = true;
  let meetups = getState().meetups;
  let me = getState().me;
  subscribe(() => {
    const s = getState();
    if (s.meetups === meetups && s.me === me) return;
    ({ meetups, me } = s);
    void reconcileReminders();
  });
  void reconcileReminders();
}
