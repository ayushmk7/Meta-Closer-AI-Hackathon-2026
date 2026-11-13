// Module-level store: the Shell calls useBadge / useRows outside Common Ground routes, so no provider.
// Action signatures are frozen for slices B and C; bodies may get smarter (A2) without changing them.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { StorageAdapter } from '../../core/persistence';
import type { ExternalRow } from '../../extensions/types';
import { api, getUser, setUser, shareQuery, type RequestOptions } from './api';
import { TZ } from './types';
import { resetMock } from './mock';
import { startCalendar, wipeCalendar } from './calendar';
import { cancelReminders, startReminders } from './notifications';
import { startRealtime, stopRealtime } from './realtime';
import type {
  CalendarApplied,
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
  Share,
  ShareFilter,
  VerifyResult,
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
  missingPlans: Record<string, true>; // getPlan said 404
  shares: Share[]; // the unfiltered anonymous gallery (Explore, Welcome, Ideas)
  sharesBy: Record<string, Share[]>; // filtered loads, keyed by shareQuery(filter)
  publicShares: Share[]; // logged-out gallery (anonymous listShares)
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
  storyPrompt: Record<string, 'posted' | 'dismissed'>; // meetupId -> my after-meetup story choice
  passportSeen: string[]; // earned stamp ids (kind:key) already shown on Passport
  // Device bookkeeping (C1-allowed): calendar.ts and notifications.ts own these.
  calendar: CalendarPrefs;
  reminders: Record<string, { id: string; at: string }>;
}
export interface CalendarPrefs {
  id: string | null; // the app's own "Common Ground" calendar
  events: Record<string, { eventId: string; sig: string }>; // directive key -> device event
  applied: CalendarApplied[]; // reported in the next syncCalendar
}
const PREFS = [
  'userOverride',
  'homeCardDismissed',
  'lastMode',
  'drafts',
  'storyPrompt',
  'passportSeen',
  'calendar',
  'reminders',
] as const;
const STORAGE_KEY = 'common-ground:v2';
export const QUESTS_KEY = 'common-ground-quests:v1';
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
  missingPlans: {},
  shares: [],
  sharesBy: {},
  publicShares: [],
  people: {},
  threads: [],
  messages: {},
  muse: { conversationId: null, asking: false, lastText: null, reply: null },
  error: null,
  userOverride: null,
  homeCardDismissed: false,
  lastMode: null,
  drafts: {},
  storyPrompt: {},
  passportSeen: [],
  calendar: { id: null, events: {}, applied: [] },
  reminders: {},
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
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** `select` must return a stable reference for unchanged state (no fresh `[]`/`{}`), or React loops. */
export function useCg<T>(select: (s: CgState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Try again.';
function fail(e: unknown, retry?: () => void) {
  setState({ error: { message: messageOf(e), retry } });
}

// Keep optimistic messages the server has not echoed yet (matched by clientId).
function withPending(threadId: string, items: Message[]) {
  const ids = new Set(items.map((m) => m.clientId).filter(Boolean));
  const pending = (state.messages[threadId] ?? []).filter(
    (m) => m.messageId.startsWith('pending:') && !ids.has(m.clientId),
  );
  return { ...state.messages, [threadId]: [...items, ...pending] };
}
// Bumped by reset/setIdentity so in-flight work for the old identity is dropped.
let gen = 0;
function loader<A extends unknown[]>(get: (...args: A) => Promise<Partial<CgState> | null>) {
  const run = async (...args: A): Promise<void> => {
    const g = gen;
    try {
      const patch = await get(...args);
      // Drop responses from before a reset/identity switch; a success clears the error banner.
      if (g === gen) setState({ ...patch, error: null });
    } catch (e) {
      if (g === gen) fail(e, () => void run(...args));
    }
  };
  return run;
}
// Per-meetup write stamps: a fetch only lands if nothing newer (a later fetch, a step event) wrote
// that meetup since it left, so out-of-order responses never drop steps (CONTRACTS §3 rule 10).
let meetupClock = 0;
const meetupWrote: Record<string, number> = {};
function putMeetups(fresh: Meetup[], t: number): Partial<CgState> {
  const meetups = { ...state.meetups };
  for (const m of fresh)
    if ((meetupWrote[m.meetupId] ?? 0) < t) {
      meetups[m.meetupId] = m;
      meetupWrote[m.meetupId] = t;
    }
  return { meetups };
}
export const load = {
  config: loader(async () => ({ config: await api.getConfig() })),
  me: loader(async () => ({ me: await api.getMe() })),
  setup: loader(async () => ({ setup: await api.getSetup() })),
  connectors: loader(async () => ({ connectors: await api.listConnectors() })),
  signals: loader(async () => ({ signals: await api.listSignals() })),
  feed: loader(async () => ({ feed: await api.getFeed() })),
  // A 404 marks the plan missing (the pop-up shows NotFound) instead of the global banner.
  plan: loader(async (planId: string) => {
    try {
      const p = await api.getPlan(planId);
      const { [planId]: _found, ...missingPlans } = state.missingPlans;
      return { plans: { ...state.plans, [planId]: p }, missingPlans };
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
      return { missingPlans: { ...state.missingPlans, [planId]: true as const } };
    }
  }),
  joins: loader(async () => ({ joins: await api.listJoins() })),
  meetups: loader(async () => {
    const t = ++meetupClock;
    return putMeetups(await api.listMeetups(), t);
  }),
  meetup: loader(async (meetupId: string) => {
    const t = ++meetupClock;
    return putMeetups([await api.getMeetup(meetupId)], t);
  }),
  approvals: loader(async () => ({ approvals: await api.listApprovals() })),
  nudges: loader(async () =>
    state.config?.features.nudges ? { nudges: await api.listNudges() } : { nudges: [] },
  ),
  connections: loader(async () => ({ connections: await api.listConnections() })),
  // Signed in: an empty filter fills `shares`, any other lands in `sharesBy[shareQuery]`.
  // `anonymous` (no X-CG-User, logged-out Welcome) fills `publicShares` and `sharesBy['anon:…']`,
  // so it never overwrites the signed-in likedByMe/mine.
  shares: loader(async (filter: ShareFilter = {}, opts: RequestOptions = {}) => {
    const key = (opts.anonymous ? 'anon:' : '') + shareQuery(filter);
    const items = await api.listShares(filter, opts);
    if (key === '') return { shares: items };
    if (key === 'anon:') return { publicShares: items };
    return { sharesBy: { ...state.sharesBy, [key]: items } };
  }),
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
        storyPrompt:
          saved.storyPrompt && typeof saved.storyPrompt === 'object' ? saved.storyPrompt : {},
        passportSeen: Array.isArray(saved.passportSeen) ? saved.passportSeen : [],
        calendar: saved.calendar?.events ? saved.calendar : state.calendar,
        reminders: saved.reminders && typeof saved.reminders === 'object' ? saved.reminders : {},
      };
    } catch {
      // unreadable prefs: start fresh
    }
    setUser(state.userOverride);
    const g = gen;
    await Promise.all([load.config(), load.me()]);
    if (g !== gen) return;
    if (!state.config || !state.me) {
      // Stay not-ready; Retry (or the next shell hook mount) reruns the whole start.
      starting = null;
      return setState({
        error: {
          message: state.error?.message ?? "Couldn't reach Common Ground. Check your connection.",
          retry: () => void start(),
        },
      });
    }
    if (state.me.optedIn) await refreshAll();
    if (g !== gen) return;
    setState({ ready: true });
    startRealtime();
    startCalendar();
    startReminders();
  })());
}

// `retry` re-invokes the calling store action so its bookkeeping reruns too; without one the
// banner has no Retry (a bare re-call would drop the result). Success clears the banner.
export async function act<T>(
  fn: () => Promise<T>,
  retry?: (() => unknown) | null,
): Promise<T | undefined> {
  try {
    const out = await fn();
    if (state.error) setState({ error: null });
    return out;
  } catch (e) {
    fail(e, (e as { retryable?: boolean }).retryable && retry ? () => void retry() : undefined);
    return undefined;
  }
}

// ---- Setup and connectors ----
export async function optIn(mode: Mode, poolId?: string): Promise<boolean> {
  const me = await act(
    () => api.optIn(mode, poolId),
    () => optIn(mode, poolId),
  );
  if (!me) return false;
  setState({ me, lastMode: mode });
  return true;
}
export async function connect(provider: string): Promise<boolean> {
  const c = await act(
    () => api.connectConnector(provider),
    () => connect(provider),
  );
  if (!c) return false;
  setState({ connectors: state.connectors.map((x) => (x.provider === provider ? c : x)) });
  await Promise.all([load.setup(), load.signals()]);
  return true;
}
export async function disconnect(provider: string): Promise<boolean> {
  if (
    !(await act(
      () => api.disconnectConnector(provider).then(() => true),
      () => disconnect(provider),
    ))
  )
    return false;
  await Promise.all([load.connectors(), load.setup(), load.signals()]);
  return true;
}

// ---- Muse bar ----
// Errors keep the typed text: the caller keeps its input; `muse.lastText` holds what was sent.
export async function askMuse(text: string): Promise<MuseReply | undefined> {
  const g = gen;
  setState({ muse: { ...state.muse, asking: true, lastText: text } });
  const reply = await act(
    () => api.askMuse(text, state.muse.conversationId),
    () => askMuse(text),
  );
  if (g !== gen) return undefined; // switched identity: never hand one person's conversation to the next
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
  const j = await act(
    () => api.joinPlan(planId, opts),
    () => join(planId, opts),
  );
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
  if (
    !(await act(
      () => api.withdrawJoin(planId).then(() => true),
      () => withdraw(planId),
    ))
  )
    return false;
  setMyJoin(planId, null);
  setState({ joins: state.joins.filter((j) => j.planId !== planId) });
  return true;
}
export async function createPlan(
  text: string,
  inviteUserIds?: string[],
): Promise<PlanDetail | undefined> {
  const p = await act(
    () => api.createPlan(text, inviteUserIds),
    () => createPlan(text, inviteUserIds),
  );
  if (p) setState({ plans: { ...state.plans, [p.planId]: p } });
  return p;
}

// ---- Shares and verification ----
// Patch a share in the gallery and in every filtered list holding it.
const swapIn = (list: Share[], x: Share) => list.map((s) => (s.shareId === x.shareId ? x : s));
const putShare = (x: Share) =>
  setState({
    shares: swapIn(state.shares, x),
    sharesBy: Object.fromEntries(
      Object.entries(state.sharesBy).map(([k, list]) => [k, swapIn(list, x)]),
    ),
  });
const findShare = (shareId: string) =>
  [state.shares, ...Object.values(state.sharesBy)].flat().find((s) => s.shareId === shareId);
// Only the latest like/unlike per share may write its result (taps can resolve out of order).
const likeSeq: Record<string, number> = {};
// Optimistic like; the server's Share wins (or the old one comes back on failure).
export async function likeShare(shareId: string, liked: boolean): Promise<Share | undefined> {
  const n = (likeSeq[shareId] = (likeSeq[shareId] ?? 0) + 1);
  const before = findShare(shareId);
  if (before && before.likedByMe !== liked)
    putShare({ ...before, likedByMe: liked, likes: before.likes + (liked ? 1 : -1) });
  const x = await act(
    () => api.likeShare(shareId, liked),
    () => likeShare(shareId, liked),
  );
  if (n !== likeSeq[shareId]) return x; // a newer tap owns the state
  if (x) putShare(x);
  else if (before) putShare(before);
  return x;
}
export async function shareMeetup(meetupId: string, caption: string): Promise<Share | undefined> {
  const x = await act(
    () => api.shareMeetup(meetupId, caption),
    null, // no idempotency key: never auto-retry into a duplicate public share
  );
  if (x) setState({ shares: [x, ...state.shares.filter((s) => s.shareId !== x.shareId)] });
  return x;
}
// Scan or typed code. Refetches the meetup so both attendees show verified.
export async function verifyAttendee(
  meetupId: string,
  code: string,
): Promise<VerifyResult | undefined> {
  const r = await act(
    () => api.verifyAttendee(meetupId, code),
    () => verifyAttendee(meetupId, code),
  );
  if (r?.accepted) await load.meetup(meetupId);
  return r;
}
// "Plan something like this": like it, then a new plan if I may create plans, else ask Muse.
export async function planLikeThis(share: Share): Promise<PlanDetail | MuseReply | undefined> {
  if (!share.likedByMe) void likeShare(share.shareId, true);
  return state.config?.features.userPlans && state.me?.capabilities.canCreatePlans
    ? createPlan(share.promptText)
    : askMuse(share.promptText);
}

// ---- Nudges ----
export async function dismissNudge(nudgeId: string, mute: 'none' | 'signal' = 'none') {
  const before = state.nudges;
  setState({ nudges: before.filter((n) => n.nudgeId !== nudgeId) });
  if (
    !(await act(
      () => api.dismissNudge(nudgeId, mute).then(() => true),
      () => dismissNudge(nudgeId, mute),
    ))
  )
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
  meetupWrote[meetupId] = ++meetupClock;
  setState({
    meetups: { ...state.meetups, [meetupId]: { ...m, museSteps: mergeSteps(m.museSteps, step) } },
  });
}
// C8: only ever called from the approval sheet's own button press.
export async function decideApproval(
  approvalId: string,
  decision: 'approve' | 'decline',
): Promise<Approval | undefined> {
  const a = await act(
    () => api.decideApproval(approvalId, decision),
    null /* C8: re-tap in the sheet */,
  );
  if (!a) return undefined;
  const swap = (list: Approval[]) => list.map((x) => (x.approvalId === approvalId ? a : x));
  const m = state.meetups[a.meetupId];
  if (m) meetupWrote[m.meetupId] = ++meetupClock;
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
  const m = await act(
    () => api.leaveMeetup(meetupId),
    () => leaveMeetup(meetupId),
  );
  if (!m) return false;
  setState(putMeetups([m], ++meetupClock));
  void load.joins();
  return true;
}

// ---- Chat ----
export async function sendMessage(
  threadId: string,
  text: string,
  opts: { toMuse?: boolean } = {},
): Promise<void> {
  const g = gen;
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
    if (g !== gen) return; // switched identity mid-send
    const echoed = list().some((m) => m.clientId === clientId && m !== temp);
    setState({
      messages: put(
        echoed ? list().filter((m) => m !== temp) : list().map((m) => (m === temp ? sent : m)),
      ),
    });
  } catch (e) {
    if (g !== gen) return;
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
  gen++;
  stopRealtime();
  starting = null;
  const { homeCardDismissed, lastMode, drafts, storyPrompt, passportSeen, calendar, reminders } =
    state;
  setState({
    ...initial(),
    userOverride: userId,
    homeCardDismissed,
    lastMode,
    drafts,
    storyPrompt,
    passportSeen,
    calendar,
    reminders,
  });
  await start();
}

// Meetups whose faux venue call already played this session (memory only, never disk).
export const calledMeetups = new Set<string>();

export async function reset(): Promise<void> {
  gen++;
  calledMeetups.clear();
  stopRealtime();
  starting = null;
  await Promise.all([wipeCalendar(), cancelReminders()]); // before the maps are forgotten
  await storage().remove();
  try {
    // Quests streak (slice 5) lives under its own key; Reset demo clears it too.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- AsyncStorage; absent in Node tests.
    await require('../../platform/scopedStorage').createScopedStorage(QUESTS_KEY).remove();
  } catch {
    // Node tests
  }
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
// Array selectors are cached on their inputs so they are safe to pass to useCg.
const NONE: never[] = [];
const nudgeCache = new Map<string, { nudges: Nudge[]; ok: boolean; out: Nudge[] }>();
export const nudgesFor = (s: CgState, surface: NudgeSurface): Nudge[] => {
  const ok = on(s) && !!s.config?.features.nudges;
  const hit = nudgeCache.get(surface);
  if (hit && hit.nudges === s.nudges && hit.ok === ok) return hit.out;
  const out = ok ? s.nudges.filter((n) => n.surfaces.includes(surface)) : NONE;
  nudgeCache.set(surface, { nudges: s.nudges, ok, out });
  return out;
};
let approvalCache: { approvals: Approval[]; out: Approval[] } | null = null;
export const pendingApprovals = (s: CgState): Approval[] => {
  if (approvalCache?.approvals !== s.approvals)
    approvalCache = {
      approvals: s.approvals,
      out: s.approvals.filter((a) => a.status === 'pending'),
    };
  return approvalCache.out;
};
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
        subtitle: t.lastMessage?.text ?? 'Say hi',
        imageUri: t.kind === 'direct' ? uri(t.participants[0]?.avatarUrl) : null,
        initials: (t.kind === 'direct' && t.participants[0]?.initials) || t.title.slice(0, 1),
        unread: t.unreadCount > 0,
        href: `/common-ground/chat/${t.threadId}`,
      }))
    : [];
const shortTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  });
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
