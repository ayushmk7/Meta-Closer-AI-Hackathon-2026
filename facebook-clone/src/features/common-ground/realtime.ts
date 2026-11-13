// Realtime (CONTRACTS §6): WebSocket while foreground and opted in; events are hints, REST is truth.
// With the socket down (always, on the mock), poll at pollIntervalS / feedRefreshS (§3 rule 8).
import { MOCK, wsUrl } from './api';
import { getState, load, mergeStep, refreshAll } from './store';
import { decodeEvent, type MuseStep, type RealtimeEvent } from './types';

type Data = Record<string, unknown>;
const str = (d: Data, k: string) => (typeof d[k] === 'string' ? (d[k] as string) : undefined);
const meetup = (d: Data) => {
  const id = str(d, 'meetupId');
  return id ? load.meetup(id) : undefined;
};
// calendar.ts registers here (keeps expo-calendar out of this graph).
export const hooks = { calendarChanged: (): unknown => undefined, url: wsUrl };

const HANDLERS: Record<string, (d: Data) => unknown> = {
  'feed.updated': () => load.feed(),
  'join.updated': (d) => {
    const id = str(d, 'planId'); // an open plan page shows myJoin from its own copy
    return Promise.all([load.joins(), load.feed(), id && getState().plans[id] ? load.plan(id) : 0]);
  },
  'meetup.updated': (d) => Promise.all([meetup(d), load.meetups()]),
  'meetup.step': (d) => {
    const id = str(d, 'meetupId');
    const step = d.step as MuseStep | undefined;
    if (id && step?.stepId) mergeStep(id, step);
    else return meetup(d);
  },
  'approval.requested': (d) => Promise.all([load.approvals(), meetup(d)]),
  'nudge.created': () => load.nudges(),
  'message.created': (d) => {
    const id = str(d, 'threadId');
    return Promise.all([id && getState().messages[id] ? load.messages(id) : 0, load.threads()]);
  },
  'thread.updated': () => load.threads(),
  'connection.created': () => load.connections(),
  'calendar.changed': () => hooks.calendarChanged(),
  'signals.updated': () => Promise.all([load.signals(), load.setup()]),
  'me.updated': () => Promise.all([load.me(), load.config()]),
};
// Unknown types are skipped (rule 4); hasOwn keeps 'constructor' and friends out.
export function handleEvent(e: RealtimeEvent): void {
  if (Object.hasOwn(HANDLERS, e.type)) void HANDLERS[e.type]!(e.data);
}

// Fast: things that change while you watch. Slow: lists that refresh in the background.
// While Muse is gathering people, the join (and its open plan) can flip to matched any second.
const gathering = async () => {
  const waiting = getState().joins.filter((j) => j.status === 'interested');
  if (!waiting.length) return;
  await Promise.all([
    load.joins(),
    ...waiting.filter((j) => getState().plans[j.planId]).map((j) => load.plan(j.planId)),
  ]);
  const s = getState();
  if (s.joins.some((j) => j.meetupId && !s.meetups[j.meetupId])) await load.meetups();
};
export const pollFast = () =>
  Promise.all([
    gathering(),
    load.approvals(),
    load.threads(),
    ...Object.values(getState().meetups)
      .filter((m) => m.status === 'setting_up')
      .map((m) => load.meetup(m.meetupId)),
  ]);
export const pollSlow = () => Promise.all([load.feed(), load.joins(), load.nudges()]);

const BACKOFF_S = [1, 2, 4, 8, 15];
// A socket counts as healthy only after staying open this long: then backoff resets, and a
// reconnect refetches at most once per window (a server that accepts then drops can't storm us).
const STABLE_MS = 10_000;
let lastRefresh = 0;
let ws: WebSocket | null = null;
let open = false;
let attempt = 0;
let running = false;
let timers: ReturnType<typeof setInterval>[] = [];
let retry: ReturnType<typeof setTimeout> | null = null;
let appState: { remove(): void } | null = null;

function connect() {
  const s = getState();
  const url = hooks.url();
  if (!running || ws || retry || !url || !s.config?.features.realtime || !s.me?.optedIn) return;
  const sock = new WebSocket(url);
  ws = sock;
  let openedAt = 0;
  sock.onopen = () => {
    open = true;
    openedAt = Date.now();
    if (attempt && openedAt - lastRefresh >= STABLE_MS) {
      lastRefresh = openedAt;
      void refreshAll(); // refetch everything visible after reconnecting
    }
  };
  sock.onmessage = (m) => {
    try {
      handleEvent(decodeEvent(JSON.parse(String(m.data))));
    } catch {
      // not JSON (e.g. pong): ignore
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    open = false;
    ws = null;
    if (openedAt && Date.now() - openedAt >= STABLE_MS) attempt = 0;
    if (!running) return;
    retry = setTimeout(
      () => {
        retry = null;
        connect();
      },
      BACKOFF_S[Math.min(attempt++, BACKOFF_S.length - 1)]! * 1000,
    );
  };
}

export function startRealtime(): void {
  const config = getState().config;
  if (running || !config) return;
  running = true;
  const every = (ms: number, fn: () => Promise<unknown>) => {
    let busy = false; // skip a tick while the last poll is out, so responses can't land out of order
    const t = setInterval(() => {
      if (!getState().me?.optedIn) return;
      connect(); // (re)connects after opt-in or foreground; no-op while connected
      if (open || busy) return;
      busy = true;
      void fn().finally(() => (busy = false));
    }, ms);
    (t as { unref?: () => void }).unref?.(); // Node: never keep tests alive
    timers.push(t);
  };
  // ponytail: the mock is local, so poll it every second to keep Muse's steps live (D7).
  every(MOCK ? 1000 : config.limits.pollIntervalS * 1000, pollFast);
  every(config.limits.feedRefreshS * 1000, pollSlow);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- keep react-native out of the registry graph and Node tests.
    const { AppState } = require('react-native') as typeof import('react-native');
    appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') return connect();
      attempt = Math.max(attempt, 1); // background: drop the socket; refetch on return
      const sock = ws;
      ws = null;
      open = false;
      sock?.close();
    });
  } catch {
    // Node tests: no AppState
  }
  connect();
}

export function stopRealtime(): void {
  running = false;
  timers.forEach(clearInterval);
  timers = [];
  if (retry) clearTimeout(retry);
  retry = null;
  appState?.remove();
  appState = null;
  const sock = ws;
  ws = null;
  open = false;
  attempt = 0;
  sock?.close();
}
