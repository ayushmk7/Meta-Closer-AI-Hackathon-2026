// Module-level store: the Shell calls useBadge / useRows outside Common Ground routes, so no provider.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { StorageAdapter } from '../../core/persistence';
import type { ExternalRow } from '../../extensions/types';
import { api, getUser, setUser } from './api';
import { resetMock } from './mock';
import type {
  Config,
  Connection,
  Density,
  Drop,
  HiItem,
  Invite,
  LatLng,
  MapView,
  Me,
  Meetup,
  Message,
  Mode,
  Thread,
} from './types';

export interface CgState {
  ready: boolean;
  config: Config | null;
  me: Me | null;
  drop: Drop | null;
  hi: HiItem[];
  invites: Invite[];
  connections: Connection[];
  threads: Thread[];
  messages: Record<string, Message[]>;
  meetups: Record<string, Meetup>;
  map: MapView | null;
  density: Density | null;
  error: { message: string; retry?: () => void } | null;
  celebrate: Connection | null;
  // own prefs: the only persisted fields (scoped storage 'common-ground:v1')
  userOverride: string | null;
  homeCardDismissed: boolean;
  lastMode: Mode | null;
  drafts: Record<string, string>;
}
const PREFS = ['userOverride', 'homeCardDismissed', 'lastMode', 'drafts'] as const;
const initial = (): CgState => ({
  ready: false,
  config: null,
  me: null,
  drop: null,
  hi: [],
  invites: [],
  connections: [],
  threads: [],
  messages: {},
  meetups: {},
  map: null,
  density: null,
  error: null,
  celebrate: null,
  userOverride: null,
  homeCardDismissed: false,
  lastMode: null,
  drafts: {},
});

let state = initial();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

let adapter: StorageAdapter | null = null;
export function setStorage(next: StorageAdapter): void {
  adapter = next;
}
function storage(): StorageAdapter {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- platform storage loads AsyncStorage, which plain Node tests cannot import.
  return (adapter ??= require('../../platform/scopedStorage').createScopedStorage(
    'common-ground:v1',
  ));
}
// C1: only the four own-preference fields ever reach disk.
const persist = () =>
  void storage()
    .write(JSON.stringify(Object.fromEntries(PREFS.map((k) => [k, state[k]]))))
    .catch(() => {});

export function getState(): CgState {
  return state;
}
export function setState(patch: Partial<CgState>): void {
  const prev = state;
  state = { ...state, ...patch };
  notify();
  if (PREFS.some((k) => k in patch && patch[k] !== prev[k])) persist();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export function useCg<T>(select: (s: CgState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Try again.';
function fail(e: unknown, retry?: () => void) {
  setState({ error: { message: message(e), retry } });
}

// Keep optimistic messages the server has not echoed yet (matched by clientId).
function withPending(threadId: string, items: Message[]) {
  const ids = new Set(items.map((m) => m.clientId).filter(Boolean));
  const pending = (state.messages[threadId] ?? []).filter(
    (m) => m.messageId.startsWith('pending:') && !ids.has(m.clientId),
  );
  return { ...state.messages, [threadId]: [...items, ...pending] };
}
function loader(get: () => Promise<Partial<CgState> | null>) {
  const run = async (): Promise<void> => {
    try {
      const patch = await get();
      if (patch) setState(patch);
    } catch (e) {
      fail(e, () => void run());
    }
  };
  return run;
}
export const load = {
  config: loader(async () => ({ config: await api.getConfig() })),
  me: loader(async () => ({ me: await api.getMe() })),
  drop: loader(async () => ({ drop: await api.getCurrentDrop() })),
  hi: loader(async () => ({ hi: await api.listHi() })),
  invites: loader(async () => ({ invites: await api.listInvites() })),
  connections: loader(async () => ({ connections: await api.listConnections() })),
  threads: loader(async () => ({ threads: await api.listThreads() })),
  meetups: loader(async () => ({
    meetups: Object.fromEntries((await api.listMeetups()).map((m) => [m.meetupId, m])),
  })),
  map: loader(async () => ({ map: await api.getMap() })),
  density: loader(async () => {
    const poolId = state.me?.poolId ?? state.config?.modes[0]?.poolId;
    return poolId ? { density: await api.getDensity(poolId) } : null;
  }),
  messages: (threadId: string) =>
    loader(async () => ({ messages: withPending(threadId, await api.listMessages(threadId)) }))(),
  meetup: (meetupId: string) =>
    loader(async () => {
      const m = await api.getMeetup(meetupId);
      return { meetups: { ...state.meetups, [meetupId]: m } };
    })(),
};
export async function refreshAll(): Promise<void> {
  await Promise.all([
    load.drop(),
    load.hi(),
    load.invites(),
    load.connections(),
    load.threads(),
    load.meetups(),
    load.map(),
  ]);
}

// ponytail: one global poll for the shell badges/rows; screens poll their own detail with usePoll.
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
function startPolling() {
  if (timer || !state.config) return;
  timer = setInterval(async () => {
    if (inFlight || !state.me?.optedIn) return;
    inFlight = true;
    await Promise.all([load.threads(), load.drop(), load.hi(), load.invites(), load.meetups()]);
    inFlight = false;
  }, state.config.limits.pollIntervalS * 1000);
  (timer as { unref?: () => void }).unref?.(); // Node: never keep tests alive
}
function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

let starting: Promise<void> | null = null;
export function start(): Promise<void> {
  return (starting ??= (async () => {
    try {
      const saved = JSON.parse((await storage().read()) ?? '{}');
      state = {
        ...state,
        userOverride: typeof saved.userOverride === 'string' ? saved.userOverride : null,
        homeCardDismissed: saved.homeCardDismissed === true,
        lastMode: typeof saved.lastMode === 'string' ? saved.lastMode : null,
        drafts: saved.drafts && typeof saved.drafts === 'object' ? saved.drafts : {},
      };
    } catch {
      // unreadable prefs: start fresh
    }
    setUser(state.userOverride);
    await Promise.all([load.config(), load.me()]);
    if (state.me?.optedIn) await refreshAll();
    setState({ ready: true });
    startPolling();
  })());
}

export async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    fail(e, (e as { retryable?: boolean }).retryable ? () => void act(fn) : undefined);
    return undefined;
  }
}

export async function decide(suggestionId: string, decision: 'connect' | 'pass'): Promise<void> {
  const r = await act(() => api.decideSuggestion(suggestionId, decision));
  if (!r) return;
  const card = state.drop?.cards.find((c) => c.suggestionId === suggestionId);
  if (state.drop)
    setState({
      drop: {
        ...state.drop,
        cards: state.drop.cards.map((c) =>
          c.suggestionId === suggestionId ? { ...c, state: r.state } : c,
        ),
      },
    });
  if (r.state !== 'connected') return;
  await Promise.all([load.connections(), load.threads(), load.map()]);
  setState({
    celebrate:
      r.connection ??
      state.connections.find((c) => c.person.userId === card?.person.userId) ??
      null,
  });
}

export async function sendMessage(threadId: string, text: string): Promise<void> {
  const clientId = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const temp: Message = {
    messageId: `pending:${clientId}`,
    threadId,
    sender: { kind: 'user', userId: getUser() },
    text,
    createdAt: new Date().toISOString(),
    clientId,
    attachments: [],
  };
  const list = () => state.messages[threadId] ?? [];
  const put = (items: Message[]) => ({ ...state.messages, [threadId]: items });
  const { [threadId]: _sent, ...drafts } = state.drafts;
  setState({ messages: put([...list(), temp]), drafts });
  try {
    const sent = await api.sendMessage(threadId, text, clientId);
    const echoed = list().some((m) => m.clientId === clientId && m !== temp);
    setState({
      messages: put(
        echoed ? list().filter((m) => m !== temp) : list().map((m) => (m === temp ? sent : m)),
      ),
    });
  } catch (e) {
    setState({
      messages: put(list().filter((m) => m !== temp)),
      drafts: { ...state.drafts, [threadId]: text },
    });
    fail(e);
  }
}

export async function setIdentity(userId: string | null): Promise<void> {
  stopPolling();
  starting = null;
  const { homeCardDismissed, lastMode, drafts } = state;
  setState({ ...initial(), userOverride: userId, homeCardDismissed, lastMode, drafts });
  await start();
}

export async function reset(): Promise<void> {
  stopPolling();
  starting = null;
  lastSent = 0;
  await storage().remove();
  resetMock();
  setUser(null);
  state = initial();
  notify();
}

export async function currentLocation(): Promise<LatLng | null> {
  const fake = state.config?.demo.fakeLocation;
  if (fake) return fake; // C2: never ask for permission in demo mode
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module; keep it out of Node tests.
    const Location = require('expo-location') as typeof import('expo-location');
    if (!(await Location.requestForegroundPermissionsAsync()).granted) return null;
    const { coords } = await Location.getCurrentPositionAsync({});
    return { lat: coords.latitude, lng: coords.longitude };
  } catch {
    return null;
  }
}
let lastSent = 0;
export async function sendLocation(): Promise<void> {
  const config = state.config;
  if (!config || Date.now() - lastSent < config.limits.locationMinIntervalS * 1000) return;
  lastSent = Date.now();
  const location = await currentLocation();
  if (location) await act(() => api.updateLocation(location));
}

// Pure selectors behind the shell hooks (exported for tests).
export const badgeCount = (s: CgState): number =>
  !s.me?.optedIn || s.error
    ? 0
    : (s.drop?.cards.filter((c) => c.state === 'open').length ?? 0) +
      s.hi.length +
      s.invites.filter((i) => i.status === 'pending').length +
      s.threads.filter((t) => t.unreadCount > 0).length;
const uri = (url?: string | null) => (url && !url.startsWith('asset:') ? url : null);
export const inboxRows = (threads: Thread[], optedIn: boolean): ExternalRow[] =>
  optedIn
    ? threads.map((t) => ({
        id: t.threadId,
        title: t.title,
        subtitle: t.lastMessage?.text ?? 'Say hello',
        imageUri: t.kind === 'direct' ? uri(t.participants[0]?.avatarUrl) : null,
        initials: (t.kind === 'direct' && t.participants[0]?.initials) || t.title.slice(0, 1),
        unread: t.unreadCount > 0,
        href: `/common-ground/chat/${t.threadId}`,
      }))
    : [];
export const eventRows = (meetups: Record<string, Meetup>, optedIn: boolean): ExternalRow[] =>
  optedIn
    ? Object.values(meetups)
        .filter((m) => m.status === 'confirmed')
        .map((m) => ({
          id: m.meetupId,
          title: m.title ?? 'Meetup',
          subtitle: [m.venue?.name, m.eventLabel].filter(Boolean).join(' · '),
          time: m.startsAt
            ? new Date(m.startsAt).toLocaleString('en-US', {
                weekday: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })
            : undefined,
          imageUri: null,
          initials: (m.title ?? 'M').slice(0, 1),
          href: `/common-ground/meetup/${m.meetupId}`,
        }))
    : [];

// Start (or restart after a reset) whenever a shell hook sees the store not ready.
function useStart() {
  const ready = useCg((s) => s.ready);
  useEffect(() => {
    if (!ready) void start();
  }, [ready]);
}
export function useBadge(): number {
  useStart();
  return useCg(badgeCount);
}
export function useInboxRows(): ExternalRow[] {
  useStart();
  const threads = useCg((s) => s.threads);
  const optedIn = useCg((s) => !!s.me?.optedIn);
  return useMemo(() => inboxRows(threads, optedIn), [threads, optedIn]);
}
export function useEventRows(): ExternalRow[] {
  useStart();
  const meetups = useCg((s) => s.meetups);
  const optedIn = useCg((s) => !!s.me?.optedIn);
  return useMemo(() => eventRows(meetups, optedIn), [meetups, optedIn]);
}
