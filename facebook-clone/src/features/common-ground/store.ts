// Module-level store: the Shell calls useBadge / useRows outside Common Ground routes, so no provider.
// Action signatures are frozen for slices B and C; bodies may get smarter (A2) without changing them.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { StorageAdapter } from '../../core/persistence';
import type { ExternalRow } from '../../extensions/types';
import { api, getUser, setUser } from './api';
import { resetMock } from './mock';
import type {
  Approval,
  Config,
  Connection,
  Connector,
  Feed,
  GroupSize,
  Join,
  LatLng,
  Me,
  Meetup,
  Message,
  Mode,
  MuseReply,
  MuseStep,
  Nudge,
  NudgeSurface,
  PlanCard,
  PlanDetail,
  PublicProfile,
  Setup,
  Signal,
  Thread,
} from './types';

export interface MuseBarState {
  conversationId: string | null;
  asking: boolean;
  lastText: string | null;
  reply: MuseReply | null;
}
export interface CgState {
  ready: boolean;
  config: Config | null;
  me: Me | null;
  setup: Setup | null;
  connectors: Connector[];
  signals: Signal[];
  feed: Feed | null;
  plans: Record<string, PlanDetail>;
  joins: Join[];
  meetups: Record<string, Meetup>;
  approvals: Approval[];
  nudges: Nudge[];
  connections: Connection[];
  people: Record<string, PublicProfile>;
  threads: Thread[];
  messages: Record<string, Message[]>;
  muse: MuseBarState;
  error: { message: string; retry?: () => void } | null;
  // own prefs: the only persisted fields (scoped storage 'common-ground:v2', C1)
  userOverride: string | null;
  homeCardDismissed: boolean;
  lastMode: Mode | null;
  drafts: Record<string, string>;
}
const PREFS = ['userOverride', 'homeCardDismissed', 'lastMode', 'drafts'] as const;
const STORAGE_KEY = 'common-ground:v2';
const initial = (): CgState => ({
  ready: false,
  config: null,
  me: null,
  setup: null,
  connectors: [],
  signals: [],
  feed: null,
  plans: {},
  joins: [],
  meetups: {},
  approvals: [],
  nudges: [],
  connections: [],
  people: {},
  threads: [],
  messages: {},
  muse: { conversationId: null, asking: false, lastText: null, reply: null },
  error: null,
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
  return (adapter ??= require('../../platform/scopedStorage').createScopedStorage(STORAGE_KEY));
}
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

const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Try again.';
function fail(e: unknown, retry?: () => void) {
  setState({ error: { message: messageOf(e), retry } });
}
const byId = <T>(list: T[], key: (x: T) => string) =>
  Object.fromEntries(list.map((x) => [key(x), x]));

// Keep optimistic messages the server has not echoed yet (matched by clientId).
function withPending(threadId: string, items: Message[]) {
  const ids = new Set(items.map((m) => m.clientId).filter(Boolean));
  const pending = (state.messages[threadId] ?? []).filter(
    (m) => m.messageId.startsWith('pending:') && !ids.has(m.clientId),
  );
  return { ...state.messages, [threadId]: [...items, ...pending] };
}
function loader<A extends unknown[]>(get: (...args: A) => Promise<Partial<CgState> | null>) {
  const run = async (...args: A): Promise<void> => {
    try {
      const patch = await get(...args);
      if (patch) setState(patch);
    } catch (e) {
      fail(e, () => void run(...args));
    }
  };
  return run;
}
export const load = {
  config: loader(async () => ({ config: await api.getConfig() })),
  me: loader(async () => ({ me: await api.getMe() })),
  setup: loader(async () => ({ setup: await api.getSetup() })),
  connectors: loader(async () => ({ connectors: await api.listConnectors() })),
  signals: loader(async () => ({ signals: await api.listSignals() })),
  feed: loader(async () => ({ feed: await api.getFeed() })),
  plan: loader(async (planId: string) => {
    const p = await api.getPlan(planId);
    return { plans: { ...state.plans, [planId]: p } };
  }),
  joins: loader(async () => ({ joins: await api.listJoins() })),
  meetups: loader(async () => ({
    meetups: { ...state.meetups, ...byId(await api.listMeetups(), (m) => m.meetupId) },
  })),
  meetup: loader(async (meetupId: string) => {
    const m = await api.getMeetup(meetupId);
    return { meetups: { ...state.meetups, [meetupId]: m } };
  }),
  approvals: loader(async () => ({ approvals: await api.listApprovals() })),
  nudges: loader(async () =>
    state.config?.features.nudges ? { nudges: await api.listNudges() } : { nudges: [] },
  ),
  connections: loader(async () => ({ connections: await api.listConnections() })),
  person: loader(async (userId: string) => {
    const p = await api.getPerson(userId);
    return { people: { ...state.people, [userId]: p } };
  }),
  threads: loader(async () => ({ threads: await api.listThreads() })),
  messages: loader(async (threadId: string) => ({
    messages: withPending(threadId, await api.listMessages(threadId)),
  })),
};
// Plans home pull-to-refresh and the post-start load.
export async function refreshAll(): Promise<void> {
  await Promise.all([
    load.feed(),
    load.joins(),
    load.meetups(),
    load.approvals(),
    load.nudges(),
    load.connections(),
    load.threads(),
  ]);
}

// ponytail: one global poll for shell badges/rows at feedRefreshS; screens poll their own detail
// with usePoll at pollIntervalS. A2 replaces this with realtime.ts (WS + polling fallback).
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
function startPolling() {
  if (timer || !state.config) return;
  timer = setInterval(async () => {
    if (inFlight || !state.me?.optedIn) return;
    inFlight = true;
    await Promise.all([load.threads(), load.approvals(), load.nudges(), load.joins()]);
    inFlight = false;
  }, state.config.limits.feedRefreshS * 1000);
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

// ---- Setup and connectors ----
export async function optIn(mode: Mode, poolId?: string): Promise<boolean> {
  const me = await act(() => api.optIn(mode, poolId));
  if (!me) return false;
  setState({ me, lastMode: mode });
  return true;
}
export async function connect(provider: string): Promise<boolean> {
  const c = await act(() => api.connectConnector(provider));
  if (!c) return false;
  setState({ connectors: state.connectors.map((x) => (x.provider === provider ? c : x)) });
  await Promise.all([load.setup(), load.signals()]);
  return true;
}
export async function disconnect(provider: string): Promise<boolean> {
  if (!(await act(() => api.disconnectConnector(provider).then(() => true)))) return false;
  await Promise.all([load.connectors(), load.setup(), load.signals()]);
  return true;
}

// ---- Muse bar ----
// Errors keep the typed text: the caller keeps its input; `muse.lastText` holds what was sent.
export async function askMuse(text: string): Promise<MuseReply | undefined> {
  setState({ muse: { ...state.muse, asking: true, lastText: text } });
  const reply = await act(() => api.askMuse(text, state.muse.conversationId));
  setState({
    muse: {
      ...state.muse,
      asking: false,
      conversationId: reply?.conversationId ?? state.muse.conversationId,
      reply: reply ?? state.muse.reply,
    },
  });
  return reply;
}
export function clearMuse(): void {
  setState({ muse: { ...state.muse, reply: null, lastText: null } });
}

// ---- Plans and joins ----
const patchCard = <T extends PlanCard>(p: T, myJoin: PlanCard['myJoin']): T => ({ ...p, myJoin });
function setMyJoin(planId: string, myJoin: PlanCard['myJoin']) {
  const plan = state.plans[planId];
  setState({
    plans: plan ? { ...state.plans, [planId]: patchCard(plan, myJoin) } : state.plans,
    feed: state.feed && {
      ...state.feed,
      plans: state.feed.plans.map((p) => (p.planId === planId ? patchCard(p, myJoin) : p)),
    },
  });
}
// Optimistic "You're in" at once, then the returned Join (PRD-1 §5).
export async function join(
  planId: string,
  opts: { size?: GroupSize; plusOne?: boolean } = {},
): Promise<Join | undefined> {
  const before = state.plans[planId]?.myJoin ?? null;
  setMyJoin(planId, { joinId: `pending:${planId}`, status: 'interested' });
  const j = await act(() => api.joinPlan(planId, opts));
  if (!j) {
    setMyJoin(planId, before);
    return undefined;
  }
  setMyJoin(planId, { joinId: j.joinId, status: j.status });
  setState({ joins: [j, ...state.joins.filter((x) => x.planId !== planId)] });
  if (j.meetupId) void load.meetups();
  return j;
}
export async function withdraw(planId: string): Promise<boolean> {
  if (!(await act(() => api.withdrawJoin(planId).then(() => true)))) return false;
  setMyJoin(planId, null);
  setState({ joins: state.joins.filter((j) => j.planId !== planId) });
  return true;
}
export async function createPlan(
  text: string,
  inviteUserIds?: string[],
): Promise<PlanDetail | undefined> {
  const p = await act(() => api.createPlan(text, inviteUserIds));
  if (p) setState({ plans: { ...state.plans, [p.planId]: p } });
  return p;
}

// ---- Nudges ----
export async function dismissNudge(nudgeId: string, mute: 'none' | 'signal' = 'none') {
  const before = state.nudges;
  setState({ nudges: before.filter((n) => n.nudgeId !== nudgeId) });
  if (!(await act(() => api.dismissNudge(nudgeId, mute).then(() => true))))
    setState({ nudges: before });
}

// ---- Meetups and approvals ----
// Steps are append-only (CONTRACTS §3 rule 10): update in place by stepId, else append.
export const mergeSteps = (steps: MuseStep[], step: MuseStep): MuseStep[] =>
  steps.some((s) => s.stepId === step.stepId)
    ? steps.map((s) => (s.stepId === step.stepId ? step : s))
    : [...steps, step];
export function mergeStep(meetupId: string, step: MuseStep): void {
  const m = state.meetups[meetupId];
  if (!m) return void load.meetup(meetupId);
  setState({
    meetups: { ...state.meetups, [meetupId]: { ...m, museSteps: mergeSteps(m.museSteps, step) } },
  });
}
// C8: only ever called from the approval sheet's own button press.
export async function decideApproval(
  approvalId: string,
  decision: 'approve' | 'decline',
): Promise<Approval | undefined> {
  const a = await act(() => api.decideApproval(approvalId, decision));
  if (!a) return undefined;
  const swap = (list: Approval[]) => list.map((x) => (x.approvalId === approvalId ? a : x));
  const m = state.meetups[a.meetupId];
  setState({
    approvals: swap(state.approvals),
    meetups: m
      ? { ...state.meetups, [m.meetupId]: { ...m, approvals: swap(m.approvals) } }
      : state.meetups,
  });
  void load.meetup(a.meetupId);
  return a;
}
export async function leaveMeetup(meetupId: string): Promise<boolean> {
  const m = await act(() => api.leaveMeetup(meetupId));
  if (!m) return false;
  setState({ meetups: { ...state.meetups, [meetupId]: m } });
  void load.joins();
  return true;
}

// ---- Chat ----
export async function sendMessage(
  threadId: string,
  text: string,
  opts: { toMuse?: boolean } = {},
): Promise<void> {
  const clientId = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const temp: Message = {
    messageId: `pending:${clientId}`,
    threadId,
    sender: { kind: 'user', userId: getUser() },
    text,
    createdAt: new Date().toISOString(),
    clientId,
    toMuse: !!opts.toMuse,
    attachments: [],
  };
  const list = () => state.messages[threadId] ?? [];
  const put = (items: Message[]) => ({ ...state.messages, [threadId]: items });
  const { [threadId]: _sent, ...drafts } = state.drafts;
  setState({ messages: put([...list(), temp]), drafts });
  try {
    const sent = await api.sendMessage(threadId, text, clientId, !!opts.toMuse);
    const echoed = list().some((m) => m.clientId === clientId && m !== temp);
    setState({
      messages: put(
        echoed ? list().filter((m) => m !== temp) : list().map((m) => (m === temp ? sent : m)),
      ),
    });
  } catch (e) {
    // Failed sends keep the typed text as a draft.
    setState({
      messages: put(list().filter((m) => m !== temp)),
      drafts: { ...state.drafts, [threadId]: text },
    });
    fail(e);
  }
}

// ---- Identity, reset, location ----
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
  await storage().remove();
  resetMock();
  setUser(null);
  state = initial();
  notify();
}

// C2: the only location read; called from the Check in button only.
export async function currentLocation(): Promise<LatLng | null> {
  const fake = state.config?.demo.fakeLocation;
  if (fake) return fake; // never ask for permission in demo mode
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

// ---- Pure selectors behind the shell hooks (exported for tests) ----
const on = (s: CgState) => !!s.me?.optedIn && !s.error;
export const nudgesFor = (s: CgState, surface: NudgeSurface): Nudge[] =>
  on(s) && s.config?.features.nudges ? s.nudges.filter((n) => n.surfaces.includes(surface)) : [];
export const pendingApprovals = (s: CgState): Approval[] =>
  s.approvals.filter((a) => a.status === 'pending');
export const badgeCount = (s: CgState): number =>
  on(s)
    ? pendingApprovals(s).length +
      s.threads.filter((t) => t.unreadCount > 0).length +
      nudgesFor(s, 'plans').length
    : 0;
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
const shortTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
export const eventRows = (
  meetups: Record<string, Meetup>,
  nudges: Nudge[],
  optedIn: boolean,
): ExternalRow[] =>
  optedIn
    ? [
        ...Object.values(meetups)
          .filter((m) => m.status === 'confirmed')
          .map((m) => ({
            id: m.meetupId,
            title: m.title,
            subtitle: [m.venue.name, m.eventLabel].filter(Boolean).join(' · '),
            time: shortTime(m.startsAt),
            imageUri: uri(m.venue.photoUrl),
            initials: m.title.slice(0, 1),
            href: `/common-ground/meetup/${m.meetupId}`,
          })),
        ...nudges.map((n) => ({
          id: n.nudgeId,
          title: n.title,
          subtitle: n.text,
          imageUri: null,
          initials: n.title.slice(0, 1),
          href: `/common-ground/plan/${n.planId}`,
        })),
      ]
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
  const optedIn = useCg(on);
  return useMemo(() => inboxRows(threads, optedIn), [threads, optedIn]);
}
export function useEventRows(): ExternalRow[] {
  useStart();
  const meetups = useCg((s) => s.meetups);
  const nudges = useCg((s) => s.nudges);
  const optedIn = useCg(on);
  const events = useCg((s) => !!s.config?.features.nudges);
  return useMemo(
    () =>
      eventRows(
        meetups,
        events ? nudges.filter((n) => n.surfaces.includes('events')) : [],
        optedIn,
      ),
    [meetups, nudges, optedIn, events],
  );
}
