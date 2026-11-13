import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../../src/features/common-ground/api';
import {
  act,
  badgeCount,
  currentLocation,
  decideApproval,
  dismissNudge,
  eventRows,
  getState,
  inboxRows,
  join,
  likeShare,
  planLikeThis,
  shareMeetup,
  verifyAttendee,
  load,
  mergeStep,
  mergeSteps,
  nudgesFor,
  pendingApprovals,
  optIn,
  refreshAll,
  reset,
  sendMessage,
  setIdentity,
  setState,
  setStorage,
  start,
  withdraw,
} from '../../src/features/common-ground/store';
import { STEP_DELAY_S, mockRequest, resetMock } from '../../src/features/common-ground/mock';
import { clock, when } from '../../src/features/common-ground/time';
import {
  handleEvent,
  hooks,
  pollFast,
  startRealtime,
  stopRealtime,
} from '../../src/features/common-ground/realtime';
import type { MuseStep } from '../../src/features/common-ground/types';

let saved: string | null = null;
setStorage({
  read: async () => saved,
  write: async (v) => void (saved = v),
  remove: async () => void (saved = null),
});

const step = (stepId: string, status = 'queued'): MuseStep => ({
  stepId,
  kind: 'book',
  status,
  label: stepId,
  at: '2026-11-12T18:00:00Z',
});

test('exported selectors return stable references on unchanged state (useCg-safe)', () => {
  const s = getState();
  for (const select of [
    badgeCount,
    pendingApprovals,
    (x: typeof s) => nudgesFor(x, 'home'),
    (x: typeof s) => nudgesFor(x, 'plans'),
  ])
    assert.equal(select(s), select(s));
});

test('mergeSteps updates in place by stepId, appends new ones, never reorders', () => {
  const steps = [step('a'), step('b'), step('c')];
  const updated = mergeSteps(steps, step('b', 'done'));
  assert.deepEqual(
    updated.map((s) => [s.stepId, s.status]),
    [
      ['a', 'queued'],
      ['b', 'done'],
      ['c', 'queued'],
    ],
  );
  assert.deepEqual(
    mergeSteps(updated, step('d')).map((s) => s.stepId),
    ['a', 'b', 'c', 'd'],
  );
});

test('Common Ground store runs the core loop on the in-app mock', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-12T18:00:00Z') });
  await reset();
  await start();
  assert.equal(getState().ready, true);
  assert.equal(getState().me?.optedIn, false);

  await t.test('shell hooks give 0 and [] when not opted in', () => {
    const s = getState();
    assert.equal(badgeCount(s), 0);
    assert.deepEqual(inboxRows(s.threads, false), []);
    assert.deepEqual(eventRows(s.meetups, s.nudges, false), []);
  });

  await t.test('only own prefs are persisted, under common-ground:v2 fields', () => {
    setState({ homeCardDismissed: true });
    assert.deepEqual(Object.keys(JSON.parse(saved!)).sort(), [
      'calendar',
      'drafts',
      'homeCardDismissed',
      'lastMode',
      'reminders',
      'userOverride',
    ]);
  });

  assert.equal(await optIn('city'), true);
  await refreshAll();
  let s = getState();
  assert.equal(s.me?.optedIn, true);
  assert.equal(s.lastMode, 'city');
  assert.ok(s.feed!.plans.length > 0);
  assert.equal(badgeCount(s), 1, 'the plans-surface nudge');

  await t.test('join is optimistic, then reconciles with the returned Join', async () => {
    await load.plan('pl_0003');
    const joining = join('pl_0003');
    assert.equal(getState().plans.pl_0003!.myJoin?.status, 'interested');
    assert.ok(getState().plans.pl_0003!.myJoin?.joinId.startsWith('pending:'));
    const j = await joining;
    assert.equal(getState().plans.pl_0003!.myJoin?.joinId, j!.joinId);
    assert.equal(
      getState().feed!.plans.find((p) => p.planId === 'pl_0003')!.myJoin?.joinId,
      j!.joinId,
    );
    assert.ok(await withdraw('pl_0003'));
    assert.equal(getState().plans.pl_0003!.myJoin, null);
  });

  await t.test('a failed join rolls back the optimistic state', async () => {
    const real = api.joinPlan;
    api.joinPlan = async () => {
      throw new Error('offline');
    };
    await join('pl_0003');
    api.joinPlan = real;
    assert.equal(getState().plans.pl_0003!.myJoin, null);
    setState({ error: null });
  });

  await t.test('joining the example plan forms its meetup; steps merge live', async () => {
    const j = await join('pl_0001');
    assert.equal(j!.status, 'interested');
    t.mock.timers.tick(10_000);
    await load.joins();
    assert.equal(getState().joins.find((x) => x.planId === 'pl_0001')!.meetupId, 'mt_0001');
    await Promise.all([load.meetups(), load.approvals(), load.threads()]);
    s = getState();
    assert.equal(inboxRows(s.threads, true)[0]!.href, '/common-ground/chat/th_0001');
    const before = s.meetups.mt_0001!.museSteps.length;
    mergeStep('mt_0001', { ...s.meetups.mt_0001!.museSteps[4]!, status: 'running' });
    mergeStep('mt_0001', step('st_new', 'running'));
    const steps = getState().meetups.mt_0001!.museSteps;
    assert.equal(steps.length, before + 1);
    assert.equal(steps[4]!.status, 'running');
    assert.equal(steps.at(-1)!.stepId, 'st_new');
  });

  await t.test('decideApproval updates the list and the meetup copy', async () => {
    assert.equal(getState().approvals.filter((a) => a.status === 'pending').length, 1);
    const a = await decideApproval('ap_0001', 'approve');
    assert.equal(a?.status, 'approved');
    assert.equal(getState().approvals[0]!.status, 'approved');
  });

  await t.test('dismissNudge removes it at once', async () => {
    await dismissNudge('nd_0001');
    assert.equal(getState().nudges.length, 0);
  });

  await t.test('optimistic send reconciles by clientId; failure restores the draft', async () => {
    const sending = sendMessage('th_0001', 'Muse, can we do 11?', { toMuse: true });
    const pending = getState().messages.th_0001!.at(-1)!;
    assert.ok(pending.messageId.startsWith('pending:'));
    assert.equal(pending.toMuse, true);
    await sending;
    const last = getState().messages.th_0001!.at(-1)!;
    assert.equal(last.clientId, pending.clientId);
    assert.equal(last.toMuse, true);
    await load.messages('th_0001');
    assert.equal(
      getState().messages.th_0001!.filter((m) => m.clientId === pending.clientId).length,
      1,
    );
    const real = api.sendMessage;
    api.sendMessage = async () => {
      throw new Error('offline');
    };
    const before = getState().messages.th_0001!.length;
    await sendMessage('th_0001', 'Lost?');
    api.sendMessage = real;
    assert.equal(getState().messages.th_0001!.length, before);
    assert.equal(getState().drafts.th_0001, 'Lost?');
    assert.equal(getState().error?.message, 'offline');
    setState({ error: null });
  });

  await t.test('C2: demo fake location is used without asking for permission', async () => {
    assert.deepEqual(await currentLocation(), getState().config!.demo.fakeLocation);
  });

  await reset();
  assert.equal(getState().ready, false);
  assert.equal(saved, null);
});

test('review fixes: retry reruns the action, success clears error, failed start, stale responses', async () => {
  const down = () => Object.assign(new Error('down'), { retryable: true });

  // (3) failed start stays not ready; Retry reruns the whole start.
  await reset();
  const realConfig = api.getConfig;
  api.getConfig = async () => {
    throw down();
  };
  await start();
  api.getConfig = realConfig;
  assert.equal(getState().ready, false);
  getState().error!.retry!();
  await start();
  assert.equal(getState().ready, true);
  assert.equal(getState().error, null);
  await optIn('city');
  await refreshAll();

  // (1) Retry re-invokes join, so the store records the join.
  await load.plan('pl_0003');
  const realJoin = api.joinPlan;
  api.joinPlan = async () => {
    api.joinPlan = realJoin;
    throw down();
  };
  await join('pl_0003');
  assert.equal(getState().plans.pl_0003!.myJoin, null);
  getState().error!.retry!();
  await new Promise((r) => setImmediate(r));
  assert.equal(getState().plans.pl_0003!.myJoin?.status, 'interested');

  // act: success clears the banner; no store action given -> no Retry (a bare re-call loses the result).
  setState({ error: { message: 'old' } });
  await act(async () => 1);
  assert.equal(getState().error, null);
  await act(async () => {
    throw down();
  });
  assert.equal(getState().error?.retry, undefined);

  // (2) one failure no longer zeroes the shell hooks once a load succeeds.
  setState({ error: { message: 'down' } });
  assert.equal(badgeCount(getState()), 0);
  await load.nudges();
  assert.equal(getState().error, null);
  assert.ok(badgeCount(getState()) > 0);

  // (4) a response for the old identity is dropped after setIdentity.
  const realApprovals = api.listApprovals;
  let release!: () => void;
  api.listApprovals = () =>
    new Promise((r) => (release = () => r([{ approvalId: 'STALE' } as never])));
  const inFlight = load.approvals();
  api.listApprovals = realApprovals;
  await setIdentity('u_0042');
  release();
  await inFlight;
  assert.ok(!getState().approvals.some((a) => a.approvalId === 'STALE'));
  await reset();
});

test('staged mock: forms, ticks steps, waits for approval, books, reschedules, not_filled', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-12T18:00:00Z') });
  resetMock();
  const u = 'u_maya';
  type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw mock JSON
  const call = (m: string, p: string, b?: unknown) => mockRequest(u, m, p, b) as Promise<Json>;
  const D = STEP_DELAY_S * 1000;
  const statuses = async () =>
    ((await call('GET', '/v1/meetups/mt_0001')).museSteps as Json[]).map((s) => s.status);
  await call('POST', '/v1/optin', { mode: 'city' });
  await call('POST', '/v1/plans/pl_0001/join', {});
  assert.equal((await call('GET', '/v1/meetups')).items.length, 0, 'not formed yet');
  t.mock.timers.tick(2 * D);
  assert.equal((await call('GET', '/v1/meetups')).items.length, 1, 'formed');
  assert.deepEqual((await statuses()).slice(0, 2), ['running', 'queued']);
  t.mock.timers.tick(10 * D);
  assert.deepEqual(await statuses(), [
    'done',
    'done',
    'done',
    'needs_you',
    'queued',
    'queued',
    'queued',
  ]);
  assert.equal((await call('GET', '/v1/meetups/mt_0001')).status, 'setting_up');
  await call('POST', '/v1/approvals/ap_0001/decision', { decision: 'approve' });
  t.mock.timers.tick(D / 2);
  assert.deepEqual((await statuses()).slice(3, 5), ['done', 'running']);
  t.mock.timers.tick(3 * D);
  let m = await call('GET', '/v1/meetups/mt_0001');
  assert.equal(m.status, 'confirmed');
  assert.equal(m.booking.status, 'booked');
  assert.equal(m.calendar.desired, 'event');
  const start = m.startsAt;
  await call('POST', '/v1/threads/th_0001/messages', {
    text: 'Muse, can we do 11?',
    clientId: 'c1',
  });
  t.mock.timers.tick(D);
  assert.equal((await call('GET', '/v1/meetups/mt_0001')).status, 'setting_up', 'rescheduling');
  t.mock.timers.tick(2 * D);
  m = await call('GET', '/v1/meetups/mt_0001');
  assert.equal(m.status, 'confirmed');
  assert.equal(Date.parse(m.startsAt) - Date.parse(start), 3_600_000);
  assert.deepEqual(
    m.museSteps.slice(-2).map((s: Json) => s.stepId),
    ['st_0008', 'st_0009'],
  );
  const msgs = (await call('GET', '/v1/threads/th_0001/messages')).items as Json[];
  assert.equal(msgs.at(-1)!.sender.kind, 'muse');
  t.mock.timers.tick(60_000);
  const seeded = ((await call('GET', '/v1/joins')).items as Json[]).find(
    (j) => j.planId === 'pl_0002',
  )!;
  assert.equal(seeded.status, 'not_filled');
  assert.deepEqual(seeded.alternatives, ['pl_0003']);
  resetMock();
});

test('realtime events refetch what CONTRACTS §6 names; meetup.step merges; unknown types skip', () => {
  const called: string[] = [];
  const real = { ...load };
  for (const k of Object.keys(load) as (keyof typeof load)[])
    (load as Record<string, unknown>)[k] = async (...args: unknown[]) =>
      void called.push([k, ...args].join(':'));
  setState({
    meetups: {
      mt_1: { meetupId: 'mt_1', museSteps: [step('a')] } as never,
    },
    messages: { th_1: [] },
  });
  const ev = (type: string, data: Record<string, unknown> = {}) =>
    handleEvent({ type, eventId: 'e', at: '', data });
  ev('meetup.step', { meetupId: 'mt_1', step: step('a', 'done') });
  ev('meetup.step', { meetupId: 'mt_1', step: step('b') });
  assert.deepEqual(
    getState().meetups.mt_1!.museSteps.map((s) => [s.stepId, s.status]),
    [
      ['a', 'done'],
      ['b', 'queued'],
    ],
  );
  ev('join.updated');
  ev('approval.requested', { meetupId: 'mt_1' });
  ev('message.created', { threadId: 'th_1' });
  ev('message.created', { threadId: 'th_unopened' });
  ev('me.updated');
  ev('teleport.started');
  ev('constructor');
  Object.assign(load, real);
  assert.deepEqual(called, [
    'joins',
    'feed',
    'approvals',
    'meetup:mt_1',
    'messages:th_1',
    'threads',
    'threads',
    'me',
    'config',
  ]);
  setState({ meetups: {}, messages: {} });
});

test('event rows show times in America/Los_Angeles whatever the device zone', () => {
  const rows = eventRows(
    {
      mt_1: {
        meetupId: 'mt_1',
        title: 'Walk',
        status: 'confirmed',
        startsAt: '2026-11-14T18:00:00Z',
        venue: { name: 'Lands End' },
      } as never,
    },
    [],
    true,
  );
  assert.equal(rows[0]!.time, 'Sat 10:00 AM');
});

test('realtime: a socket that opens then drops backs off, refetches at most once, polls never overlap', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  const sockets: { onopen?: () => void; onclose?: () => void; close(): void }[] = [];
  const RealWs = globalThis.WebSocket;
  globalThis.WebSocket = class {
    onopen?: () => void;
    onclose?: () => void;
    constructor() {
      sockets.push(this);
      setTimeout(() => {
        this.onopen?.();
        setTimeout(() => this.onclose?.(), 5);
      }, 0);
    }
    close() {}
  } as never;
  const realUrl = hooks.url;
  hooks.url = () => 'ws://test/v1/ws?user=u_maya';
  const real = { ...load };
  let feeds = 0;
  let approvalsInFlight = 0;
  let maxInFlight = 0;
  (load as Record<string, unknown>).feed = async () => void feeds++;
  (load as Record<string, unknown>).approvals = () => {
    maxInFlight = Math.max(maxInFlight, ++approvalsInFlight);
    return new Promise<void>((r) => setTimeout(() => (approvalsInFlight--, r()), 3500));
  };
  setState({
    me: { optedIn: true } as never,
    config: {
      features: { realtime: true },
      limits: { pollIntervalS: 5, feedRefreshS: 60 },
    } as never,
    meetups: {},
  });
  startRealtime();
  for (let i = 0; i < 1000; i++) t.mock.timers.tick(10); // 10 s
  stopRealtime();
  globalThis.WebSocket = RealWs;
  hooks.url = realUrl;
  Object.assign(load, real);
  assert.ok(sockets.length <= 5, `${sockets.length} sockets in 10 s`);
  assert.ok(feeds <= 1, `${feeds} refetches`);
  assert.equal(maxInFlight, 1);
});

test('mock: other plans get their own detail; no steps before formation; fast poll shows the group forming', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-12T18:00:00Z') });
  await reset();
  await start();
  await optIn('city');
  const walk = (await mockRequest('u_maya', 'GET', '/v1/plans/pl_0003')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw mock JSON
  assert.equal(walk.description, '');
  assert.doesNotMatch(walk.museWillHandle.join(), /wheel|clay|\$35/i);
  assert.equal(walk.because[0].signalId, 'si_0001');
  const early = (await mockRequest('u_maya', 'GET', '/v1/meetups/mt_0001')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw mock JSON
  assert.deepEqual(early.museSteps, []);

  await load.plan('pl_0001');
  await join('pl_0001');
  t.mock.timers.tick(STEP_DELAY_S * 2000);
  await pollFast();
  const s = getState();
  assert.equal(s.plans.pl_0001!.myJoin?.status, 'matched');
  assert.equal(s.joins.find((j) => j.planId === 'pl_0001')!.meetupId, 'mt_0001');
  assert.ok(s.meetups.mt_0001);
  await reset();
});

test('shares and verify: optimistic like, share needs a finished meetup, verify, plan like this', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-12T18:00:00Z') });
  await reset();
  await start();
  await optIn('city');
  await load.shares();
  assert.equal(getState().shares.length, 8);
  assert.ok(getState().shares.every((x) => !('person' in x) && !('userId' in x)));
  await load.shares({ neighborhood: 'Mission' });
  assert.equal(getState().shares.length, 8, 'a filtered load never clobbers the gallery');
  const mission = getState().sharesBy['neighborhood=Mission']!;
  assert.ok(mission.length && mission.every((x) => x.venue.neighborhood === 'Mission'));
  await likeShare(mission[0]!.shareId, true);
  assert.equal(
    getState().shares.find((x) => x.shareId === mission[0]!.shareId)!.likedByMe,
    true,
    'a like patches every list',
  );
  await likeShare(mission[0]!.shareId, false);
  await likeShare('sh_0001', true);
  await load.shares({}, { anonymous: true });
  assert.equal(getState().publicShares.length, 8);
  assert.equal(
    getState().shares.find((x) => x.shareId === 'sh_0001')!.likedByMe,
    true,
    'a logged-out load never wipes my likes',
  );
  const anon = await api.listShares({}, { anonymous: true });
  await likeShare('sh_0002', true);
  assert.ok((await api.listShares({}, { anonymous: true })).every((x) => !x.likedByMe && !x.mine));
  assert.equal(anon.length, 8);
  await likeShare('sh_0002', false);

  // Out-of-order like responses: only the latest tap writes.
  const realLike = api.likeShare;
  let releaseFirst!: () => void;
  api.likeShare = async (id, liked) => {
    const res = await realLike(id, liked); // the server applies in send order...
    if (liked) await new Promise<void>((r) => (releaseFirst = r)); // ...the like's answer arrives last
    return res;
  };
  const first = likeShare('sh_0002', true);
  await likeShare('sh_0002', false);
  releaseFirst();
  await first;
  api.likeShare = realLike;
  assert.equal(getState().shares.find((x) => x.shareId === 'sh_0002')!.likedByMe, false);

  const liking = likeShare('sh_0001', true);
  assert.equal(getState().shares[0]!.likes, 13, 'optimistic');
  await liking;
  assert.deepEqual([getState().shares[0]!.likes, getState().shares[0]!.likedByMe], [13, true]);

  await join('pl_0001');
  t.mock.timers.tick(10_000);
  await load.meetup('mt_0001');
  assert.equal(getState().meetups.mt_0001!.verifyCode, 'MAYA42');
  assert.equal(await shareMeetup('mt_0001', 'Bowls!'), undefined, 'not over yet');
  assert.equal(getState().error?.retry, undefined, 'shareMeetup is never auto-retried');
  setState({ error: null });
  assert.equal((await verifyAttendee('mt_0001', 'DANI42'))?.reason, 'outside_window');
  await decideApproval('ap_0001', 'approve');
  t.mock.timers.tick(10_000);
  assert.equal((await verifyAttendee('mt_0001', 'https://x/y'))?.reason, 'invalid_code');
  assert.equal((await verifyAttendee('mt_0001', 'maya42'))?.reason, 'self');
  const v = await verifyAttendee('mt_0001', 'DANI42');
  assert.equal(v?.accepted, true);
  const atts = getState().meetups.mt_0001!.attendees;
  assert.equal(atts.find((a) => a.isMe)!.verified, true);
  assert.equal(atts.filter((a) => a.verified).length, 2);

  t.mock.timers.tick(3 * 86_400_000);
  await load.meetup('mt_0001');
  assert.equal(getState().meetups.mt_0001!.status, 'completed');
  const mine = await shareMeetup('mt_0001', 'Bowls!');
  assert.equal(mine?.mine, true);
  assert.equal(mine?.happenedOn, '2026-11-14', 'LA local date');
  assert.equal(getState().shares[0]!.shareId, mine!.shareId);

  // Maya cannot create plans in the fixture, so it goes through the Muse bar.
  const me = getState().me!;
  setState({
    me: { ...me, capabilities: { ...me.capabilities, canCreatePlans: true } },
    config: {
      ...getState().config!,
      features: { ...getState().config!.features, userPlans: false },
    },
  });
  const r = await planLikeThis(getState().shares.find((x) => x.shareId === 'sh_0002')!);
  assert.ok(r && 'conversationId' in r);
  assert.equal(getState().shares.find((x) => x.shareId === 'sh_0002')!.likedByMe, true);
  await reset();
});

test('a missing plan is marked per plan, not as the global error; copy uses contractions', async () => {
  await reset();
  await start();
  await optIn('city');
  await load.plan('pl_nope');
  assert.equal(getState().missingPlans.pl_nope, true);
  assert.equal(getState().error, null);
  await load.plan('pl_0001');
  assert.equal(getState().missingPlans.pl_0001, undefined);
  assert.equal(
    inboxRows(
      [
        {
          threadId: 't',
          kind: 'group',
          title: 'G',
          participants: [],
          unreadCount: 0,
          updatedAt: '',
        },
      ],
      true,
    )[0]!.subtitle,
    'Say hi',
  );
  await reset();
});

test('when/clock: LA time, no ":00", plain space', () => {
  assert.equal(clock('2026-11-14T18:00:00Z'), '10 AM');
  assert.equal(clock('2026-11-14T16:30:00Z'), '8:30 AM');
  assert.equal(when('2026-11-14T18:00:00Z'), 'Sat, Nov 14 · 10 AM');
});

test('demo mock: seeded progress and a join from today; finishing a meetup unlocks plans', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-12T18:00:00Z') });
  resetMock();
  type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw mock JSON
  const call = (m: string, p: string, b?: unknown) =>
    mockRequest('u_maya', m, p, b) as Promise<Json>;
  await call('POST', '/v1/optin', { mode: 'city' });
  assert.equal((await call('GET', '/v1/me')).rewards.confirmedMeetups, 2);
  const seeded = (await call('GET', '/v1/joins')).items[0];
  assert.equal(seeded.createdAt.slice(0, 10), '2026-11-12');
  await call('POST', '/v1/plans/pl_0001/join', {});
  t.mock.timers.tick(3 * 86_400_000);
  await call('GET', '/v1/meetups/mt_0001');
  const me = await call('GET', '/v1/me');
  assert.deepEqual(
    [me.rewards.confirmedMeetups, me.rewards.nextUnlock, me.capabilities.canCreatePlans],
    [3, null, true],
  );
  resetMock();
});
