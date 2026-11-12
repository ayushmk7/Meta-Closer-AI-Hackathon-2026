// In-app fake server, seeded from contracts/openapi.json examples (Metro cannot bundle outside the app).
// Timed transitions are timestamps checked on each request, never setTimeout, so Node tests never hang.
import type {
  Config,
  Connection,
  Density,
  Drop,
  DropCard,
  GroupRequest,
  HiItem,
  InterestRef,
  Invite,
  MapView,
  Me,
  Meetup,
  MeetupOption,
  Message,
  MyInterest,
  OnboardingSession,
  PersonCard,
  Thread,
  Venue,
} from './types';

const ME = 'u_maya';
const iso = (ms: number) => new Date(ms).toISOString();
const ref = (id: string, label: string, path: string[]): InterestRef => ({
  id,
  label,
  path,
  level: path.length,
});
const hiking = ref('outdoors.hiking', 'Hiking', ['Outdoors', 'Hiking']);
const boardGames = ref('games.board_games', 'Board games', ['Games', 'Board games']);
const ceramics = ref('arts_crafts.ceramics', 'Ceramics', ['Arts & crafts', 'Ceramics']);
const climbing = ref('outdoors.climbing', 'Climbing', ['Outdoors', 'Climbing']);
const coastal = ref('outdoors.hiking.coastal_hikes', 'Coastal hikes', [
  'Outdoors',
  'Hiking',
  'Coastal hikes',
]);
const strategy = ref('games.board_games.strategy_games', 'Strategy board games', [
  'Games',
  'Board games',
  'Strategy board games',
]);
const wheel = ref('arts_crafts.ceramics.wheel_throwing', 'Wheel throwing', [
  'Arts & crafts',
  'Ceramics',
  'Wheel throwing',
]);
const mine = (interest: InterestRef, weight: number, extra: Partial<MyInterest> = {}) =>
  ({
    interest,
    weight,
    visibility: 'shown',
    sensitive: false,
    source: 'onboarding',
    ...extra,
  }) as MyInterest;

const person = (
  userId: string,
  displayName: string | null,
  initials: string,
  avatarUrl: string | null,
): PersonCard => ({
  userId,
  displayName,
  initials,
  avatarUrl,
  profileVisibility: displayName ? 'public' : 'private',
});
const daniel = person('u_0042', 'Daniel Okafor', 'DO', 'asset:kai');

const venues: Venue[] = [
  {
    venueId: 'vn_lands_end',
    name: 'Lands End Lookout',
    neighborhood: 'Outer Richmond',
    location: { lat: 37.7798, lng: -122.5118 },
    kind: 'park',
  },
  {
    venueId: 'vn_game_parlor',
    name: 'Game Parlor',
    neighborhood: 'Mission',
    location: { lat: 37.7599, lng: -122.4148 },
    kind: 'game_cafe',
  },
  {
    venueId: 'vn_clay_studio',
    name: 'Sunset Clay Studio',
    neighborhood: 'Inner Sunset',
    location: { lat: 37.7637, lng: -122.4689 },
    kind: 'studio',
  },
];
const options = (): MeetupOption[] =>
  [
    [
      'Sunrise walk at Lands End, then coffee',
      '2026-11-15T15:30:00Z',
      '2026-11-15T17:30:00Z',
      'You both love the coast trail and are free Saturday morning.',
    ],
    [
      'Strategy game night',
      '2026-11-19T03:00:00Z',
      '2026-11-19T05:30:00Z',
      'A public game cafe with long tables.',
    ],
    [
      'Open wheel session',
      '2026-11-16T21:00:00Z',
      '2026-11-16T23:00:00Z',
      'A drop-in studio a few blocks from you, with wheels free on Sunday.',
    ],
  ].map(([activity, startsAt, endsAt, reason], i) => ({
    optionId: `op_000${i + 1}`,
    activity,
    venue: venues[i],
    startsAt,
    endsAt,
    reason,
    votes: { yes: 0, no: 0 },
    myVote: null,
  }));

const config: Config = {
  apiVersion: '1',
  features: {
    eventMode: true,
    groups: true,
    sayHi: true,
    leaderboard: false,
    unlocks: false,
    checkin: true,
    locationSharing: true,
    density: true,
    realtime: false,
  },
  limits: {
    dropMax: 5,
    sharedCoarseMax: 3,
    sharedFullMax: 8,
    openersPerPersonPerWeek: 1,
    openerMaxChars: 280,
    messageMaxChars: 2000,
    groupSizeMin: 2,
    groupSizeMax: 8,
    locationMinIntervalS: 30,
    pollIntervalS: 5,
    mapRefreshS: 30,
    meetupStatusBeforeMin: 60,
  },
  modes: [
    {
      mode: 'city',
      label: 'San Francisco',
      poolId: 'pool_sf_city',
      available: true,
      description: 'People near you in San Francisco',
      center: { lat: 37.7749, lng: -122.4194 },
      radiusKm: 10,
    },
    {
      mode: 'event',
      label: 'Closer Together AI Hackathon',
      poolId: 'pool_evt_closer_together',
      available: true,
      description: 'People at this event, Nov 11 to 13',
      center: { lat: 37.4848, lng: -122.1484 },
      radiusKm: 2,
    },
    {
      mode: 'campus',
      label: 'Campus',
      poolId: 'pool_campus_placeholder',
      available: false,
      description: 'Coming soon',
    },
  ],
  demo: {
    enabled: true,
    fakeLocation: { lat: 37.7694, lng: -122.4862 },
    counterpart: 'synthetic',
    relaxCheckin: true,
  },
};

// Flat-top hexagon around a centre, about 400 m across.
const hex = (lat: number, lng: number) =>
  Array.from({ length: 6 }, (_, i) => ({
    lat: +(lat + 0.0045 * Math.sin((Math.PI / 3) * i)).toFixed(4),
    lng: +(lng + 0.0057 * Math.cos((Math.PI / 3) * i)).toFixed(4),
  }));
const density: Density = {
  poolId: 'pool_sf_city',
  totalLooking: 214,
  minBinCount: 10,
  bins: [
    [37.7703, -122.488, 23],
    [37.7703, -122.4709, 31],
    [37.7793, -122.4795, 18],
    [37.7613, -122.4795, 14],
    [37.7793, -122.4624, 27],
    [37.7613, -122.4538, 12],
    [37.7703, -122.4453, 40],
  ].map(([lat, lng, count], i) => ({
    binId: `hx_88283082${i}ffff`,
    count,
    polygon: hex(lat, lng),
  })),
};

function seed(now = Date.now()) {
  const card = (
    n: number,
    p: PersonCard,
    distanceBand: string,
    sharedInterests: InterestRef[],
    reason: string,
  ): DropCard => ({
    suggestionId: `sg_000${n}`,
    person: p,
    distanceBand,
    sharedInterests,
    reason,
    state: 'open',
    hiAvailable: true,
  });
  const drop: Drop = {
    dropId: 'dr_0001',
    poolId: 'pool_sf_city',
    generatedAt: iso(now),
    expiresAt: iso(now + 86_400_000),
    nextDropAt: iso(now + 86_400_000),
    cards: [
      card(
        1,
        daniel,
        '1_3km',
        [hiking, boardGames],
        'You both spend weekends on the coast trails and love a long strategy game.',
      ),
      card(
        2,
        person('u_0117', null, 'R', null),
        'under_1km',
        [ceramics],
        'Another ceramics person a few blocks from you.',
      ),
      card(
        3,
        person('u_0188', 'Marcus Hale', 'MH', 'asset:lucas'),
        '3_10km',
        [climbing, hiking],
        'You both like to climb, and he is out on the trails most Sundays.',
      ),
      card(
        4,
        person('u_0203', 'Isabel Ortiz', 'IO', 'asset:ava'),
        '1_3km',
        [ceramics, boardGames],
        'She throws pots on weekends and hosts a monthly game night.',
      ),
      card(
        5,
        person('u_0251', 'Wen Zhou', 'WZ', null),
        'under_1km',
        [boardGames, hiking, climbing],
        'Wen is new to the Sunset and looking for a regular game group.',
      ),
    ],
  };
  const me: Me = {
    userId: ME,
    displayName: 'Maya Chen',
    avatarUrl: 'asset:maya',
    profileVisibility: 'public',
    optedIn: false,
    mode: null,
    poolId: null,
    neighborhood: 'Inner Sunset',
    groupSize: { min: 2, max: 4 },
    availability: [
      { day: 'sat', part: 'morning' },
      { day: 'sun', part: 'afternoon' },
      { day: 'wed', part: 'evening' },
    ],
    ghostMode: false,
    interests: [
      mine(coastal, 0.82, {
        source: 'activity',
        evidence: 'Posted three photos from a coastal hike',
      }),
      mine(wheel, 0.7),
      mine(strategy, 0.55, { source: 'activity' }),
    ],
    capabilities: { canHost: false, maxGroupSize: 4, groupOnly: false, dailySlots: 5 },
    unlocks: [],
  };
  const hi: HiItem[] = [
    {
      hiId: 'hi_0101',
      from: person('u_0233', null, 'J', null),
      sharedInterests: [ceramics],
      text: 'Hi! I am trying to find people to share a wheel at the studio on Sundays. Interested?',
      receivedAt: iso(now - 3_600_000),
    },
  ];
  const invites: Invite[] = [
    {
      inviteId: 'iv_0001',
      from: person('u_0311', 'Nadia Brooks', 'NB', null),
      sharedInterests: [boardGames],
      size: { min: 3, max: 4 },
      status: 'pending',
      expiresAt: iso(now + 86_400_000),
      threadId: null,
    },
  ];
  return {
    me,
    session: null as OnboardingSession | null,
    turns: 0,
    drop,
    hi,
    invites,
    groups: {} as Record<string, GroupRequest>,
    connections: [] as Connection[],
    threads: [] as Thread[],
    messages: {} as Record<string, Message[]>,
    meetups: {} as Record<string, Meetup>,
    map: {
      generatedAt: iso(now),
      me: { location: null, ghostMode: false },
      friends: [],
      tray: [],
      meetups: [],
    } as MapView,
    due: [] as { at: number; run(): void }[],
    seq: 1000,
  };
}
let s = seed();
export function resetMock(): void {
  s = seed();
}

const next = (prefix: string) => `${prefix}${++s.seq}`;
const fail = (status: number, code: string, message: string): never => {
  throw { status, error: { code, message, retryable: false } };
};
const notFound = () => fail(404, 'not_found', 'That person is no longer available.');
const must = <T>(value: T | undefined): T => value ?? notFound();
const later = (ms: number, run: () => void) => s.due.push({ at: Date.now() + ms, run });

function post(
  threadId: string,
  text: string,
  sender: Message['sender'],
  extra: Partial<Message> = {},
) {
  const t = must(s.threads.find((x) => x.threadId === threadId));
  const m: Message = {
    messageId: next('ms_'),
    threadId,
    sender,
    text,
    createdAt: iso(Date.now()),
    clientId: null,
    attachments: [],
    ...extra,
  };
  (s.messages[threadId] ??= []).push(m);
  t.lastMessage = m;
  t.updatedAt = m.createdAt;
  if (sender.userId !== ME) t.unreadCount += 1;
  return m;
}
const muse = (threadId: string, text: string, extra?: Partial<Message>) =>
  post(threadId, text, { kind: 'muse', userId: null }, extra);

function addThread(threadId: string, kind: string, title: string, participants: PersonCard[]) {
  s.threads.unshift({
    threadId,
    kind,
    title,
    participants,
    lastMessage: null,
    unreadCount: 0,
    updatedAt: iso(Date.now()),
    activeMeetupId: null,
  });
}
function connect(p: PersonCard, sharedInterests: InterestRef[], threadId: string) {
  const c: Connection = {
    connectionId: next('cn_'),
    person: p,
    sharedInterests,
    threadId,
    status: 'new',
    connectedAt: iso(Date.now()),
    firstMetAt: null,
    location: { iShare: 'off', theyShare: 'off', viewing: 'neighborhood' },
    canViewProfile: p.profileVisibility === 'public',
  };
  s.connections.push(c);
  addThread(threadId, 'direct', p.displayName ?? 'Someone nearby', [p]);
  s.map.tray.push({
    userId: p.userId,
    person: p,
    reason: 'not_met',
    threadId,
    sharedInterests: sharedInterests.slice(0, 3),
  });
  return c;
}
function groupThread(title: string, participants: PersonCard[]) {
  const threadId = s.threads.some((t) => t.threadId === 'th_0002') ? next('th_') : 'th_0002';
  addThread(threadId, 'group', title, participants);
  muse(
    threadId,
    'Welcome, everyone. You all love a good board game. Want me to find a time that works?',
  );
  return threadId;
}

const proposed: MyInterest[] = [
  mine(coastal, 0.82),
  mine(ref('outdoors.hiking.day_hikes', 'Day hikes', ['Outdoors', 'Hiking', 'Day hikes']), 0.6),
  mine(
    ref('outdoors.climbing.bouldering', 'Bouldering', ['Outdoors', 'Climbing', 'Bouldering']),
    0.45,
  ),
  mine(strategy, 0.7),
  mine(
    ref('games.board_games.party_games', 'Party games', ['Games', 'Board games', 'Party games']),
    0.4,
  ),
  mine(ref('games.tabletop_rpg', 'Tabletop RPGs', ['Games', 'Tabletop RPGs']), 0.35),
  mine(
    ref('identity_values.faith.spirituality', 'Spirituality', [
      'Identity & values',
      'Faith & spirituality',
      'Spirituality',
    ]),
    0.3,
    { sensitive: true, visibility: 'hidden', evidence: 'You mentioned a weekly meditation group' },
  ),
];
const museReplies = [
  'That sounds lovely. Do you prefer meeting one on one, or in a small group?',
  'Good to know. When are you usually free to meet new people?',
  'Thanks, I have a good picture now. Here is what I picked up. Hide or remove anything you like.',
];

type Handler = (p: string[], body: Record<string, unknown>, q: URLSearchParams) => unknown;
const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/v1\/config$/, () => config],
  ['GET', /^\/v1\/me$/, () => s.me],
  ['PATCH', /^\/v1\/me$/, (_, b) => Object.assign(s.me, b)],
  [
    'PUT',
    /^\/v1\/me\/interests\/([^/]+)$/,
    ([id], b) => {
      const i = must(s.me.interests.find((x) => x.interest.id === id));
      i.visibility = b.visibility as MyInterest['visibility'];
      return i;
    },
  ],
  [
    'DELETE',
    /^\/v1\/me\/interests\/([^/]+)$/,
    ([id]) => {
      s.me.interests = s.me.interests.filter((x) => x.interest.id !== id);
    },
  ],
  [
    'POST',
    /^\/v1\/optin$/,
    (_, b) => {
      const mode = must(config.modes.find((m) => m.mode === b.mode && m.available));
      return Object.assign(s.me, {
        optedIn: true,
        mode: mode.mode,
        poolId: (b.poolId as string) ?? mode.poolId,
      });
    },
  ],
  [
    'DELETE',
    /^\/v1\/optin$/,
    () => {
      Object.assign(s.me, { optedIn: false, mode: null, poolId: null });
    },
  ],
  [
    'POST',
    /^\/v1\/onboarding\/sessions$/,
    () => {
      s.turns = 0;
      return (s.session = {
        sessionId: 'ob_7f3a',
        status: 'chatting',
        messages: [
          {
            messageId: 'om_1',
            role: 'muse',
            text: 'Hi Maya! I already noticed you post a lot about hikes and pottery. What else do you love doing on a free weekend?',
            createdAt: iso(Date.now()),
          },
        ],
        proposedInterests: [],
      });
    },
  ],
  [
    'POST',
    /^\/v1\/onboarding\/sessions\/([^/]+)\/messages$/,
    ([id], b) => {
      const session = s.session?.sessionId === id ? s.session : notFound();
      const at = iso(Date.now());
      const turn = s.turns++;
      const messages = [
        { messageId: next('om_'), role: 'user', text: String(b.text), createdAt: at },
        {
          messageId: next('om_'),
          role: 'muse',
          text: museReplies[Math.min(turn, 2)],
          createdAt: at,
        },
      ];
      session.messages.push(...messages);
      if (turn >= 2)
        Object.assign(session, {
          status: 'review',
          proposedInterests: proposed,
          proposedGroupSize: { min: 2, max: 4 },
          proposedAvailability: [
            { day: 'sat', part: 'morning' },
            { day: 'sun', part: 'afternoon' },
            { day: 'wed', part: 'evening' },
          ],
        });
      return { ...session, messages };
    },
  ],
  [
    'POST',
    /^\/v1\/onboarding\/sessions\/([^/]+)\/complete$/,
    ([id], b) => {
      const session = s.session?.sessionId === id ? s.session : notFound();
      const accepted = (b.acceptedInterestIds as string[]) ?? [];
      const hidden = (b.hiddenInterestIds as string[]) ?? [];
      session.status = 'complete';
      return Object.assign(s.me, {
        interests: session.proposedInterests
          .filter((i) => accepted.includes(i.interest.id))
          .map((i) => ({ ...i, visibility: hidden.includes(i.interest.id) ? 'hidden' : 'shown' })),
        groupSize: b.groupSize,
        availability: b.availability,
        profileVisibility: b.profileVisibility,
        ...(b.neighborhood ? { neighborhood: b.neighborhood } : {}),
      });
    },
  ],
  ['GET', /^\/v1\/pools\/([^/]+)\/density$/, ([poolId]) => ({ ...density, poolId })],
  ['GET', /^\/v1\/drops\/current$/, () => s.drop],
  [
    'POST',
    /^\/v1\/suggestions\/([^/]+)\/decision$/,
    ([id], b) => {
      const c = must(s.drop.cards.find((x) => x.suggestionId === id));
      const was = c.state;
      if (b.decision === 'pass') c.state = 'passed';
      else if (id === 'sg_0001') c.state = 'connected';
      else c.state = 'connect_sent';
      let connection = s.connections.find((x) => x.person.userId === c.person.userId) ?? null;
      if (c.state === 'connected' && was !== 'connected') {
        connection = connect(c.person, [coastal, strategy], 'th_0001');
        connection.connectionId = 'cn_0001';
        muse(
          'th_0001',
          'Maya, meet Daniel. You both hike the coast trails most weekends, and you are both into long strategy games.',
          {
            attachments: [
              {
                kind: 'starters',
                starters: [
                  "What's your favorite stretch of the coast trail?",
                  'Which strategy game could you play every week?',
                  'Ever tried hiking to Lands End at sunrise?',
                ],
              },
            ],
          },
        );
      }
      return { suggestionId: id, state: c.state, connection };
    },
  ],
  [
    'POST',
    /^\/v1\/suggestions\/([^/]+)\/hi$/,
    ([id], b) => {
      must(s.drop.cards.find((x) => x.suggestionId === id));
      return String(b.text).includes('http')
        ? { hiId: null, status: 'rejected', rejectionReason: 'screened' }
        : { hiId: next('hi_'), status: 'delivered' };
    },
  ],
  ['GET', /^\/v1\/hi$/, () => ({ items: s.hi })],
  [
    'POST',
    /^\/v1\/hi\/([^/]+)\/reply$/,
    ([id], b) => {
      const h = must(s.hi.find((x) => x.hiId === id));
      s.hi = s.hi.filter((x) => x !== h);
      const p = { ...h.from, displayName: h.from.displayName ?? 'Jess' }; // first name only after a mutual connect
      const threadId = next('th_');
      const c = connect(p, [wheel], threadId);
      post(threadId, h.text, { kind: 'user', userId: p.userId });
      post(threadId, String(b.text), { kind: 'user', userId: ME });
      return c;
    },
  ],
  [
    'POST',
    /^\/v1\/hi\/([^/]+)\/dismiss$/,
    ([id]) => {
      must(s.hi.find((x) => x.hiId === id));
      s.hi = s.hi.filter((x) => x.hiId !== id);
    },
  ],
  [
    'POST',
    /^\/v1\/groups$/,
    (_, b) => {
      const ids = (b.suggestionIds as string[]) ?? [];
      const g = {
        groupRequestId: next('gr_'),
        status: 'inviting',
        invitedCount: ids.length,
        acceptedCount: 0,
        size: b.size as GroupRequest['size'],
        threadId: null,
      };
      s.groups[g.groupRequestId] = g;
      later(3000, () => {
        const people = s.drop.cards
          .filter((x) => ids.includes(x.suggestionId))
          .map((x) => x.person);
        Object.assign(g, {
          status: 'formed',
          acceptedCount: ids.length,
          threadId: groupThread('Your new group', people),
        });
      });
      return g;
    },
  ],
  ['GET', /^\/v1\/groups\/([^/]+)$/, ([id]) => must(s.groups[id])],
  ['GET', /^\/v1\/invites$/, () => ({ items: s.invites })],
  [
    'POST',
    /^\/v1\/invites\/([^/]+)\/decision$/,
    ([id], b) => {
      const i = must(s.invites.find((x) => x.inviteId === id));
      if (i.status !== 'pending') return i;
      i.status = b.decision === 'accept' ? 'accepted' : 'declined';
      if (i.status === 'accepted') i.threadId = groupThread('Board game night', [i.from]);
      return i;
    },
  ],
  ['GET', /^\/v1\/connections$/, () => ({ items: s.connections })],
  [
    'GET',
    /^\/v1\/people\/([^/]+)$/,
    ([id]) => {
      const c = must(s.connections.find((x) => x.person.userId === id && x.canViewProfile));
      return {
        person: c.person,
        bio: 'Weekend hiker, weeknight board gamer.',
        neighborhood: 'Outer Richmond',
        sharedInterests: c.sharedInterests,
        meetupsTogether: c.status === 'met' ? 1 : 0,
      };
    },
  ],
  ['GET', /^\/v1\/threads$/, () => ({ items: s.threads })],
  ['GET', /^\/v1\/threads\/([^/]+)$/, ([id]) => must(s.threads.find((x) => x.threadId === id))],
  [
    'GET',
    /^\/v1\/threads\/([^/]+)\/messages$/,
    ([id], _, q) => {
      must(s.threads.find((x) => x.threadId === id));
      const all = s.messages[id] ?? [];
      const after = q.get('after');
      const from = after ? all.findIndex((m) => m.messageId === after) + 1 : 0;
      return { items: all.slice(from) };
    },
  ],
  [
    'POST',
    /^\/v1\/threads\/([^/]+)\/messages$/,
    ([id], b) => {
      const t = must(s.threads.find((x) => x.threadId === id));
      const m = post(
        id,
        String(b.text),
        { kind: 'user', userId: ME },
        { clientId: b.clientId as string },
      );
      const other = t.participants[0];
      if (other)
        later(2000, () => post(id, 'Sounds good to me!', { kind: 'user', userId: other.userId }));
      return m;
    },
  ],
  [
    'POST',
    /^\/v1\/threads\/([^/]+)\/read$/,
    ([id]) => {
      must(s.threads.find((x) => x.threadId === id)).unreadCount = 0;
    },
  ],
  [
    'POST',
    /^\/v1\/threads\/([^/]+)\/plan$/,
    ([id], b) => {
      const t = must(s.threads.find((x) => x.threadId === id));
      const m: Meetup = {
        meetupId: next('mt_'),
        threadId: id,
        status: 'proposing',
        organizerId: ME,
        size: (b.size as Meetup['size']) ?? { min: 2, max: 4 },
        title: null,
        chosenOptionId: null,
        startsAt: null,
        endsAt: null,
        venue: null,
        options: [],
        attendees: [ME, ...t.participants.map((p) => p.userId)].map((userId) => ({
          userId,
          rsvp: 'pending',
          checkedIn: false,
          status: null,
        })),
        checkinWindow: null,
        feedbackDue: false,
        eventLabel: null,
      };
      s.meetups[m.meetupId] = m;
      t.activeMeetupId = m.meetupId;
      later(2500, () => {
        Object.assign(m, { status: 'voting', options: options() });
        muse(id, 'I found 3 options that work for both of you. Vote on the ones you like.', {
          attachments: [{ kind: 'meetup', meetupId: m.meetupId }],
        });
      });
      return m;
    },
  ],
  ['GET', /^\/v1\/meetups$/, () => ({ items: Object.values(s.meetups) })],
  ['GET', /^\/v1\/meetups\/([^/]+)$/, ([id]) => must(s.meetups[id])],
  [
    'POST',
    /^\/v1\/meetups\/([^/]+)\/votes$/,
    ([id], b) => {
      const m = must(s.meetups[id]);
      if (m.status !== 'voting') fail(409, 'conflict', 'This plan has already been decided.');
      for (const v of (b.votes as { optionId: string; vote: 'yes' | 'no' }[]) ?? []) {
        const opt = must(m.options.find((x) => x.optionId === v.optionId));
        if (opt.myVote) opt.votes[opt.myVote] -= 1;
        opt.myVote = v.vote;
        opt.votes[v.vote] += 1;
      }
      const win = m.options.find((x) => x.myVote === 'yes');
      if (win) {
        const now = Date.now();
        Object.assign(m, {
          status: 'confirmed',
          chosenOptionId: win.optionId,
          title: win.activity,
          venue: win.venue,
          startsAt: iso(now + 30 * 60_000),
          endsAt: iso(now + 2 * 3_600_000),
          checkinWindow: { opensAt: iso(now), closesAt: iso(now + 2 * 3_600_000) },
          eventLabel: `Private event · ${m.attendees.length} going`,
          attendees: m.attendees.map((x) => ({ ...x, rsvp: 'yes' })),
        });
        s.map.meetups.push({
          meetupId: id,
          title: win.activity,
          venue: win.venue,
          startsAt: m.startsAt!,
          attendeeCount: m.attendees.length,
        });
      }
      return m;
    },
  ],
  [
    'PUT',
    /^\/v1\/meetups\/([^/]+)\/my-status$/,
    ([id], b) => {
      const m = must(s.meetups[id]);
      m.attendees = m.attendees.map((x) => ({
        ...x,
        status: x.userId === ME ? (b.status as 'arrived') : 'on_my_way',
      }));
      return m;
    },
  ],
  [
    'POST',
    /^\/v1\/meetups\/([^/]+)\/checkin$/,
    ([id]) => {
      const m = must(s.meetups[id]);
      m.attendees = m.attendees.map((x) => (x.userId === ME ? { ...x, checkedIn: true } : x));
      Object.assign(m, { status: 'completed', feedbackDue: true });
      return { accepted: true };
    },
  ],
  [
    'POST',
    /^\/v1\/meetups\/([^/]+)\/feedback$/,
    ([id]) => {
      const m = must(s.meetups[id]);
      m.feedbackDue = false;
      const others = m.attendees.map((x) => x.userId).filter((u) => u !== ME);
      for (const c of s.connections.filter((x) => others.includes(x.person.userId))) {
        Object.assign(c, { status: 'met', firstMetAt: iso(Date.now()) });
        const tray = s.map.tray.find((x) => x.userId === c.person.userId);
        if (!tray) continue;
        s.map.tray = s.map.tray.filter((x) => x !== tray);
        s.map.friends.push({
          ...tray,
          precision: 'neighborhood',
          location: { lat: 37.7801, lng: -122.49 },
          radiusM: 800,
          meetupStatus: null,
          updatedAt: iso(Date.now()),
        });
      }
      s.map.meetups = s.map.meetups.filter((x) => x.meetupId !== id);
    },
  ],
  ['GET', /^\/v1\/map$/, () => ({ ...s.map, generatedAt: iso(Date.now()) })],
  [
    'PUT',
    /^\/v1\/location$/,
    (_, b) => {
      s.map.me.location = b.location as MapView['me']['location'];
    },
  ],
  [
    'PUT',
    /^\/v1\/location\/shares\/([^/]+)$/,
    ([id], b) => {
      const c = must(s.connections.find((x) => x.person.userId === id));
      c.location.iShare = b.maxPrecision as Connection['location']['iShare'];
      return c.location;
    },
  ],
  [
    'PUT',
    /^\/v1\/location\/views\/([^/]+)$/,
    ([id], b) => {
      const c = must(s.connections.find((x) => x.person.userId === id));
      c.location.viewing = b.precision as Connection['location']['viewing'];
      return c.location;
    },
  ],
  [
    'PUT',
    /^\/v1\/location\/ghost$/,
    (_, b) => {
      s.me.ghostMode = s.map.me.ghostMode = !!b.enabled;
    },
  ],
  ['POST', /^\/v1\/reports$/, () => ({ reportId: next('rp_') })],
  [
    'POST',
    /^\/v1\/blocks$/,
    (_, b) => {
      const gone = (p: { userId: string }) => p.userId !== b.userId;
      s.drop.cards = s.drop.cards.filter((x) => gone(x.person));
      s.hi = s.hi.filter((x) => gone(x.from));
      s.invites = s.invites.filter((x) => gone(x.from));
      s.connections = s.connections.filter((x) => gone(x.person));
      s.threads = s.threads.filter((x) => x.participants.every(gone));
      s.map.friends = s.map.friends.filter(gone);
      s.map.tray = s.map.tray.filter(gone);
    },
  ],
];

export async function mockRequest(
  userId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const now = Date.now();
  const due = s.due.filter((d) => d.at <= now);
  s.due = s.due.filter((d) => d.at > now);
  due.forEach((d) => d.run());
  const [pathname, query = ''] = path.split('?');
  for (const [m, pattern, handle] of routes) {
    const match = m === method ? pattern.exec(pathname) : null;
    if (!match) continue;
    const result = handle(
      match.slice(1).map(decodeURIComponent),
      (body ?? {}) as Record<string, unknown>,
      new URLSearchParams(query),
    );
    if (result === undefined) return undefined;
    const copy = JSON.parse(JSON.stringify(result));
    // ponytail: second-phone identity only swaps the name; the mock does not simulate Daniel's world.
    if (result === s.me && userId === 'u_0042') copy.displayName = 'Daniel Okafor';
    return copy;
  }
  return notFound();
}
