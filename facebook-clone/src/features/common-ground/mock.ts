// In-app fake server. Every response starts from `fixtures.json`, which is the 2xx `example` of
// each operation in contracts/openapi.json (Metro cannot bundle outside the app, so the test
// tests/common-ground/contract.test.ts keeps the copy in sync: `CG_WRITE_FIXTURES=1 npm test`).
// Staging (A2): timed transitions are timestamps checked on each request (`tick`), never
// setTimeout, so Node tests drive them with mocked Date and never hang.
import fixtures from './fixtures.json';
import type {
  Approval,
  CalendarDirective,
  CalendarSync,
  Config,
  Connection,
  Connector,
  Feed,
  GroupSize,
  Join,
  Me,
  Meetup,
  Message,
  MuseReply,
  Nudge,
  PlanCard,
  PlanDetail,
  Setup,
  Signal,
  Thread,
} from './types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const F = fixtures as unknown as {
  getHealth: unknown;
  getConfig: Config;
  getMe: Me;
  getSetup: Setup;
  listConnectors: { items: Connector[] };
  syncCalendar: { directives: CalendarDirective[] };
  askMuse: MuseReply;
  getFeed: Feed;
  getPlan: PlanDetail;
  joinPlan: Join;
  listNudges: { items: Nudge[] };
  getMeetup: Meetup;
  decideApproval: Approval;
  listConnections: { items: Connection[] };
  listMessages: { items: Message[] };
};
const now = () => new Date().toISOString();
const iso = (ms: number) => new Date(ms).toISOString();

let seq = 0;
const nextId = (prefix: string) => `${prefix}mock${(++seq).toString().padStart(3, '0')}`;

class MockError {
  status: number;
  error: { code: string; message: string; retryable: boolean };
  constructor(status: number, code: string, message: string) {
    this.status = status;
    this.error = { code, message, retryable: status >= 500 };
  }
}
const notFound = () => new MockError(404, 'not_found', "This isn't available anymore.");

// Plan details: getPlan's example, plus every other card (feed, Muse bar) with the same extras.
const detailOf = (card: PlanCard): PlanDetail => {
  const extras = clone(F.getPlan);
  const directions = {
    apple: `https://maps.apple.com/?daddr=${card.venue.location.lat},${card.venue.location.lng}&dirflg=r`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${card.venue.location.lat},${card.venue.location.lng}&travelmode=transit`,
  };
  // Plan-specific detail derived from the card, never the pottery example's copy.
  const prepaid = card.cost.kind === 'prepaid';
  return {
    ...extras,
    ...clone(card),
    description: card.reason,
    museWillHandle: [
      ...(prepaid ? [`Ask you before paying ${card.cost.label}`] : []),
      'Add it to your calendar',
      'Open a group chat with an intro',
      'Remind you when to leave',
    ],
    safety: [
      'Public place',
      `Groups of ${card.size.min} or more`,
      'Share your plan with a friend in one tap',
    ],
    formsAt: iso(Date.parse(card.startsAt) - 86_400_000),
    alternatives: [],
    directions,
  };
};

function world() {
  const plans: Record<string, PlanDetail> = { [F.getPlan.planId]: clone(F.getPlan) };
  for (const card of [...F.getFeed.plans, ...F.askMuse.plans])
    plans[card.planId] ??= detailOf(card);
  const joins: Record<string, Join> = {};
  for (const card of F.getFeed.plans)
    if (card.myJoin)
      joins[card.planId] = {
        ...clone(F.joinPlan),
        joinId: card.myJoin.joinId,
        planId: card.planId,
        status: card.myJoin.status,
        progress: { joined: card.crowd.interestedCount, needed: card.size.min },
        calendar: null,
      };
  return {
    config: clone(F.getConfig),
    // Starts before setup so the setup flow is reachable; optIn/completeSetup flip these.
    me: { ...clone(F.getMe), optedIn: false, setupComplete: false } as Me,
    setup: clone(F.getSetup),
    connectors: clone(F.listConnectors.items),
    signals: clone(F.getSetup.signals),
    plans,
    joins,
    nudges: clone(F.listNudges.items),
    // No steps until the group forms (tick builds the timeline from then on).
    meetups: { [F.getMeetup.meetupId]: { ...clone(F.getMeetup), museSteps: [] } } as Record<
      string,
      Meetup
    >,
    // Meetups appear in lists only once my join is matched (getMeetup by ID always works).
    visibleMeetups: new Set<string>(),
    // Muse's intro only; the reschedule reply (fixture ms_0003) arrives after a toMuse message.
    messages: { [F.getMeetup.threadId]: clone(F.listMessages.items.slice(0, 1)) } as Record<
      string,
      Message[]
    >,
    unread: { [F.getMeetup.threadId]: 1 } as Record<string, number>,
    connections: clone(F.listConnections.items),
    conversationId: null as string | null,
    stage: {
      born: Date.now(),
      formAt: null as number | null,
      formedAt: null as number | null,
      decidedAt: null as number | null,
      approved: null as boolean | null,
      rescheduleAt: null as number | null,
      replied: false,
    },
  };
}
let w = world();
export function resetMock(): void {
  w = world();
  seq = 0;
}

const gate = () => {
  if (!w.me.optedIn)
    throw new MockError(403, 'not_opted_in', 'Turn on Common Ground to see plans.');
};
const withJoin = <T extends PlanCard>(p: T): T => {
  const j = w.joins[p.planId];
  return {
    ...clone(p),
    myJoin: j && j.status !== 'withdrawn' ? { joinId: j.joinId, status: j.status } : null,
  };
};
const plan = (planId: string) => {
  const p = w.plans[planId];
  if (!p) throw notFound();
  return p;
};
const meetup = (meetupId: string) => {
  const m = w.meetups[meetupId];
  if (!m) throw notFound();
  return m;
};
const visibleMeetups = () => [...w.visibleMeetups].map((id) => w.meetups[id]!);
const threadOf = (m: Meetup): Thread => {
  const msgs = w.messages[m.threadId] ?? [];
  return {
    threadId: m.threadId,
    kind: 'group',
    title: m.title,
    participants: m.attendees.filter((x) => !x.isMe).map((x) => x.person),
    lastMessage: msgs.at(-1) ?? null,
    unreadCount: w.unread[m.threadId] ?? 0,
    updatedAt: msgs.at(-1)?.createdAt ?? m.museSteps[0]?.at ?? now(),
    meetupId: m.meetupId,
  };
};
const meetupOfThread = (threadId: string) => {
  const m = Object.values(w.meetups).find((x) => x.threadId === threadId);
  if (!m) throw notFound();
  return m;
};
const items = <T>(list: T[]) => ({ items: clone(list) });

type Body = Record<string, unknown> | undefined;
type Handler = (m: string[], body: Body, query: URLSearchParams, user: string) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, handler: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/\{\w+\}/g, '([^/]+)')}$`), handler]);

on('GET', '/v1/health', () => F.getHealth);
on('GET', '/v1/config', () => w.config);
on('GET', '/v1/me', () => w.me);
on('PATCH', '/v1/me', (_, b) => Object.assign(w.me, b));
on('PUT', '/v1/me/interests/{id}', ([id], b) => {
  const i = w.me.interests.find((x) => x.interest.id === id);
  if (!i) throw notFound();
  i.visibility = b?.visibility === 'hidden' ? 'hidden' : 'shown';
  return i;
});
on('DELETE', '/v1/me/interests/{id}', ([id]) => {
  w.me.interests = w.me.interests.filter((x) => x.interest.id !== id);
});
on('POST', '/v1/optin', (_, b) => {
  const mode = String(b?.mode ?? 'city');
  const info = w.config.modes.find((x) => x.mode === mode && x.available);
  if (!info) throw new MockError(400, 'validation_failed', 'That mode is not available yet.');
  return Object.assign(w.me, { optedIn: true, mode, poolId: b?.poolId ?? info.poolId });
});
on('DELETE', '/v1/optin', () => {
  Object.assign(w.me, { optedIn: false, setupComplete: false });
});
on('GET', '/v1/me/setup', () => {
  gate();
  return { ...w.setup, signals: w.signals };
});
on('POST', '/v1/me/setup', (_, b) => {
  gate();
  const accepted = new Set((b?.acceptedInterestIds as string[]) ?? []);
  const hidden = new Set((b?.hiddenInterestIds as string[]) ?? []);
  const interests = w.setup.proposedInterests
    .filter((i) => accepted.has(i.interest.id) || hidden.has(i.interest.id))
    .map((i) => ({ ...i, visibility: hidden.has(i.interest.id) ? 'hidden' : 'shown' }) as const);
  const { acceptedInterestIds: _a, hiddenInterestIds: _h, ...rest } = b ?? {};
  return Object.assign(w.me, rest, { setupComplete: true, interests });
});
on('GET', '/v1/connectors', () => {
  gate();
  return items(w.connectors);
});
const connector = (provider: string) => {
  const c = w.connectors.find((x) => x.provider === provider);
  if (!c) throw notFound();
  return c;
};
on('POST', '/v1/connectors/{provider}', ([provider]) => {
  gate();
  const c = connector(provider);
  if (c.status === 'coming_soon') throw new MockError(409, 'conflict', 'Coming soon.');
  return Object.assign(c, { status: 'connected', connectedAt: now(), lastSyncAt: now() });
});
on('DELETE', '/v1/connectors/{provider}', ([provider]) => {
  gate();
  Object.assign(connector(provider), {
    status: 'not_connected',
    connectedAt: null,
    signalCount: 0,
  });
  w.signals = w.signals.filter((s) => s.provider !== provider);
});
on('GET', '/v1/signals', () => {
  gate();
  return items(w.signals);
});
const signal = (id: string): Signal => {
  const s = w.signals.find((x) => x.signalId === id);
  if (!s) throw notFound();
  return s;
};
on('PUT', '/v1/signals/{id}', ([id], b) =>
  Object.assign(signal(id), { visibility: b?.visibility === 'hidden' ? 'hidden' : 'shown' }),
);
on('DELETE', '/v1/signals/{id}', ([id]) => {
  signal(id);
  w.signals = w.signals.filter((s) => s.signalId !== id);
});
on('POST', '/v1/calendar/sync', (_, b) => {
  const body = b as unknown as CalendarSync | undefined;
  const directives = [
    ...Object.values(w.joins).map((j) => j.calendar),
    ...visibleMeetups().map((m) => m.calendar),
  ].filter((d): d is CalendarDirective => !!d);
  return { acceptedBusy: body?.busy?.length ?? 0, directives };
});
// ponytail: one canned answer whatever the text; A2 may vary it by keyword.
on('POST', '/v1/muse/ask', () => {
  gate();
  w.conversationId ??= F.askMuse.conversationId;
  return {
    ...clone(F.askMuse),
    conversationId: w.conversationId,
    reply: { ...F.askMuse.reply, createdAt: now() },
    plans: F.askMuse.plans.map((p) => withJoin(w.plans[p.planId] ?? p)),
  };
});
on('GET', '/v1/feed', () => {
  gate();
  const busy = visibleMeetups().some((m) => m.status === 'setting_up');
  return {
    ...clone(F.getFeed),
    museStatus: busy ? F.getFeed.museStatus : null,
    plans: F.getFeed.plans.map((p) => withJoin(w.plans[p.planId]!)),
  };
});
on('POST', '/v1/plans', (_, b) => {
  gate();
  const p: PlanDetail = {
    ...clone(F.getPlan),
    planId: nextId('pl_'),
    title: String(b?.text ?? 'A new plan'),
    origin: (b?.inviteUserIds as string[] | undefined)?.length ? 'invite' : 'user',
    myJoin: null,
  };
  w.plans[p.planId] = p;
  return p;
});
on('GET', '/v1/plans/{id}', ([id]) => {
  gate();
  return withJoin(plan(id));
});
on('POST', '/v1/plans/{id}/join', ([id], b) => {
  gate();
  const p = plan(id);
  const existing = w.joins[id];
  if (existing && existing.status !== 'withdrawn') return existing;
  if (p.status !== 'open') throw new MockError(409, 'conflict', 'This plan is closed.');
  const size = (b?.size as GroupSize | undefined) ?? p.size;
  const j: Join =
    id === F.joinPlan.planId
      ? clone(F.joinPlan)
      : {
          ...clone(F.joinPlan),
          joinId: nextId('jn_'),
          planId: id,
          progress: { joined: p.crowd.interestedCount + 1, needed: size.min },
          formsAt: p.formsAt,
          createdAt: now(),
          calendar: {
            ...F.joinPlan.calendar!,
            key: '',
            title: `Hold: ${p.title}`,
            startsAt: p.startsAt,
            endsAt: p.endsAt,
          },
        };
  if (j.calendar && !j.calendar.key) j.calendar.key = j.joinId;
  w.joins[id] = j;
  if (id === F.joinPlan.planId) w.stage.formAt = Date.now() + 2 * D; // group forms after two steps
  return j;
});
on('DELETE', '/v1/plans/{id}/join', ([id]) => {
  gate();
  const j = w.joins[id];
  if (!j) throw notFound();
  Object.assign(j, { status: 'withdrawn', calendar: { ...j.calendar, desired: 'none' } });
});
on('GET', '/v1/joins', () => {
  gate();
  return items(
    Object.values(w.joins)
      .filter((j) => j.status !== 'withdrawn')
      .map((j) => ({ ...j, plan: withJoin(w.plans[j.planId]!) })),
  );
});
on('GET', '/v1/nudges', (_, __, q) => {
  gate();
  const surface = q.get('surface');
  return items(w.nudges.filter((n) => !surface || n.surfaces.includes(surface)));
});
on('POST', '/v1/nudges/{id}/dismiss', ([id]) => {
  if (!w.nudges.some((n) => n.nudgeId === id)) throw notFound();
  w.nudges = w.nudges.filter((n) => n.nudgeId !== id);
});
on('GET', '/v1/meetups', () => items(visibleMeetups()));
on('GET', '/v1/meetups/{id}', ([id]) => meetup(id));
const mine = (m: Meetup) => m.attendees.find((x) => x.isMe)!;
on('POST', '/v1/meetups/{id}/leave', ([id]) => {
  const m = meetup(id);
  mine(m).rsvp = 'left';
  m.calendar = m.calendar ? { ...m.calendar, desired: 'none' } : null;
  return m;
});
on('PUT', '/v1/meetups/{id}/my-status', ([id], b) => {
  const m = meetup(id);
  mine(m).status = b?.status === 'arrived' ? 'arrived' : 'on_my_way';
  return m;
});
on('POST', '/v1/meetups/{id}/checkin', ([id]) => {
  const m = meetup(id);
  if (!w.config.demo.relaxCheckin && !m.checkinWindow)
    return { accepted: false, reason: 'outside_window' };
  mine(m).checkedIn = true;
  return { accepted: true };
});
on('POST', '/v1/meetups/{id}/feedback', ([id]) => {
  meetup(id).feedbackDue = false;
});
on('GET', '/v1/approvals', () => items(visibleMeetups().flatMap((m) => m.approvals)));
on('POST', '/v1/approvals/{id}/decision', ([id], b) => {
  const m = Object.values(w.meetups).find((x) => x.approvals.some((a) => a.approvalId === id));
  const a = m?.approvals.find((x) => x.approvalId === id);
  if (!m || !a) throw notFound();
  if (a.status !== 'pending') throw new MockError(409, 'conflict', 'This was already decided.');
  const approve = b?.decision === 'approve';
  a.status = approve ? 'approved' : 'declined';
  if (m.meetupId === F.getMeetup.meetupId)
    Object.assign(w.stage, { decidedAt: Date.now(), approved: approve });
  if (a.kind === 'payment') m.cost.myPayment = approve ? 'paid' : 'declined';
  return a;
});
on('GET', '/v1/connections', () => items(w.visibleMeetups.size ? w.connections : []));
on('GET', '/v1/people/{id}', ([id]) => {
  const c = w.connections.find((x) => x.person.userId === id);
  if (!c) throw notFound();
  if (!c.canViewProfile || c.person.profileVisibility === 'private')
    throw new MockError(403, 'not_allowed', 'This profile is private.');
  return {
    person: c.person,
    bio: null,
    neighborhood: null,
    sharedInterests: c.sharedInterests,
    meetupsTogether: c.meetupsTogether,
  };
});
on('GET', '/v1/threads', () => items(visibleMeetups().map(threadOf)));
on('GET', '/v1/threads/{id}', ([id]) => threadOf(meetupOfThread(id)));
on('GET', '/v1/threads/{id}/messages', ([id], _, q) => {
  meetupOfThread(id);
  const list = w.messages[id] ?? [];
  const after = q.get('after');
  const from = after ? list.findIndex((x) => x.messageId === after) + 1 : 0;
  return items(list.slice(from));
});
on('POST', '/v1/threads/{id}/messages', ([id], b, _, user) => {
  meetupOfThread(id);
  const list = (w.messages[id] ??= []);
  const dup = list.find((x) => x.clientId && x.clientId === b?.clientId);
  if (dup) return dup;
  const text = String(b?.text ?? '');
  const msg: Message = {
    messageId: nextId('ms_'),
    threadId: id,
    sender: { kind: 'user', userId: user },
    text,
    createdAt: now(),
    clientId: (b?.clientId as string) ?? null,
    toMuse: b?.toMuse === true || /^muse\b/i.test(text),
    attachments: [],
  };
  list.push(msg);
  if (msg.toMuse && w.stage.formedAt && w.stage.rescheduleAt == null)
    w.stage.rescheduleAt = Date.now();
  return msg;
});
on('POST', '/v1/threads/{id}/read', ([id]) => {
  meetupOfThread(id);
  w.unread[id] = 0;
});
on('POST', '/v1/reports', () => ({ reportId: nextId('rp_') }));
on('POST', '/v1/blocks', () => undefined);

// Fallback when /v1/config has no demo.stepDelayS.
export const STEP_DELAY_S = 2;
// Step delay: the top of config.demo.stepDelayS (contracts #15), else the fallback. Set per tick.
let D = STEP_DELAY_S * 1000;
const NOT_FILLED_MS = 30_000; // the seeded join (pl_0002) doesn't fill, with alternatives
const SEEDED = F.getFeed.plans.find((p) => p.myJoin)?.planId;
const HOUR = 3_600_000;
const phase = (t: number, from: number) =>
  t < from ? 'queued' : t < from + D ? 'running' : 'done';
const muse = (stepId: string, kind: string, status: string, label: string, at: number) => ({
  stepId,
  kind,
  status,
  label,
  detail: null,
  approvalId: null,
  at: iso(at),
});

// Recompute the staged demo from timestamps: forming, steps ticking, approval -> booked,
// reschedule after a toMuse message, the seeded join not filling.
export function tick(t = Date.now()): void {
  D = (w.config.demo.stepDelayS?.at(-1) ?? STEP_DELAY_S) * 1000;
  const s = w.stage;
  const j = w.joins[F.joinPlan.planId];
  if (j?.status === 'interested' && s.formAt != null && t >= s.formAt) {
    Object.assign(j, { status: 'matched', meetupId: F.getMeetup.meetupId, calendar: null });
    s.formedAt = s.formAt;
    w.visibleMeetups.add(F.getMeetup.meetupId);
  }
  const nf = SEEDED ? w.joins[SEEDED] : undefined;
  if (nf?.status === 'interested' && t >= s.born + NOT_FILLED_MS)
    Object.assign(nf, { status: 'not_filled', alternatives: ['pl_0003'], calendar: null });
  const f = s.formedAt;
  if (f == null) return;
  const base = F.getMeetup;
  const m = w.meetups[base.meetupId]!;
  const steps = clone(base.museSteps);
  steps.slice(0, 3).forEach((st, i) => (st.status = phase(t, f + i * D)));
  steps[3]!.status =
    t < f + 3 * D ? 'queued' : s.approved == null ? 'needs_you' : s.approved ? 'done' : 'skipped';
  if (s.decidedAt != null) {
    const d = s.decidedAt;
    if (s.approved === false)
      steps.push(
        muse(
          'st_mock_hold',
          'book',
          'done',
          'Asked the studio to hold your wheel. You pay there.',
          d,
        ),
      );
    steps.slice(4, 7).forEach((st, i) => (st.status = phase(t, d + i * D)));
  }
  const done = s.decidedAt != null && t >= s.decidedAt + 3 * D;
  const r = s.rescheduleAt;
  if (r != null)
    steps.push(
      muse(
        'st_0008',
        'reschedule',
        phase(t, r),
        'Moved it to 11. Everyone is free and the studio has 3 wheels',
        r,
      ),
      muse('st_0009', 'calendar', phase(t, r + D), "Updated everyone's calendar", r),
    );
  const shift = r != null && t >= r + D ? HOUR : 0;
  m.museSteps = steps;
  m.status = done && (r == null || t >= r + 2 * D) ? 'confirmed' : 'setting_up';
  m.startsAt = iso(Date.parse(base.startsAt) + shift);
  m.endsAt = iso(Date.parse(base.endsAt) + shift);
  if (m.travel) m.travel.leaveBy = iso(Date.parse(base.travel!.leaveBy) + shift);
  if (m.calendar?.desired !== 'none')
    m.calendar = { ...base.calendar!, startsAt: m.startsAt, endsAt: m.endsAt };
  if (done) {
    m.booking = s.approved
      ? {
          status: 'booked',
          label: 'Booked 3 wheels',
          provider: 'Simulated booking',
          confirmationCode: 'HCS-4821',
        }
      : {
          status: 'pay_at_venue',
          label: 'Pay at the studio',
          provider: 'Simulated booking',
          confirmationCode: null,
        };
    m.eventLabel = 'Private event · 3 going';
    if (m.calendar?.desired !== 'none')
      m.calendar = {
        ...m.calendar!,
        desired: 'event',
        title: base.calendar!.title.replace(/^Hold: /, ''),
        notes: 'Planned with Muse in Common Ground.',
      };
    m.checkinWindow = { opensAt: iso(Date.parse(m.startsAt) - HOUR / 2), closesAt: m.endsAt };
  }
  if (r != null && t >= r + 2 * D && !s.replied) {
    s.replied = true;
    w.messages[base.threadId]!.push({ ...clone(F.listMessages.items[2]!), createdAt: iso(t) });
    w.unread[base.threadId] = (w.unread[base.threadId] ?? 0) + 1;
  }
}

export async function mockRequest(
  user: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  tick();
  const [pathname, search = ''] = path.split('?');
  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = re.exec(pathname!);
    if (!match) continue;
    const out = handler(
      match.slice(1).map(decodeURIComponent),
      body as Body,
      new URLSearchParams(search),
      user,
    );
    // D5: fixture media points at the backend (http://localhost:8000/static/…); the mock makes
    // no network requests, so those URLs become null (avatars fall back to initials).
    return out === undefined
      ? undefined
      : JSON.parse(JSON.stringify(out), (_, v) =>
          typeof v === 'string' && /^https?:\/\/localhost\b/.test(v) ? null : v,
        );
  }
  throw new MockError(404, 'not_found', 'Unknown route.');
}
