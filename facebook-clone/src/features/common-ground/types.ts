// Hand-written mirror of contracts/openapi.yaml (v2). Open enums accept any string.
type Open<T extends string> = T | (string & {});
// CONTRACTS: every local time is shown in this zone, whatever the phone's setting.
export const TZ = 'America/Los_Angeles';

export interface LatLng {
  lat: number;
  lng: number;
}
export type Mode = Open<'city' | 'event' | 'campus' | 'group' | 'arriving' | 'cohort'>;
export type Visibility = 'shown' | 'hidden';
export type ProfileVisibility = 'public' | 'private';
export type AttendeeStatus = 'on_my_way' | 'arrived';
export type TravelMode = Open<'transit' | 'walk' | 'bike' | 'drive'>;

export interface Health {
  status: Open<'ok' | 'degraded'>;
  muse?: string;
  laya?: string;
  demoMode?: boolean;
  apiVersion: string;
}
export interface ModeInfo {
  mode: Mode;
  label: string;
  poolId: string;
  available: boolean;
  description?: string;
  center?: LatLng;
  radiusKm?: number;
}
export interface Limits {
  feedMax: number;
  sharedCoarseMax: number;
  sharedFullMax: number;
  messageMaxChars: number;
  museAskMaxChars: number;
  groupSizeMin: number;
  groupSizeMax: number;
  openJoinsMax: number;
  pollIntervalS: number;
  feedRefreshS: number;
  calendarSyncMinIntervalS: number;
  calendarHorizonDays: number;
  meetupStatusBeforeMin?: number;
  [key: string]: number | undefined;
}
export type FeatureFlag =
  | 'eventMode'
  | 'connectors'
  | 'nudges'
  | 'userPlans'
  | 'payments'
  | 'autonomySettings'
  | 'plusOne'
  | 'checkin'
  | 'realtime';
export interface Config {
  apiVersion: string;
  features: Partial<Record<Open<FeatureFlag>, boolean>>;
  limits: Limits;
  modes: ModeInfo[];
  demo: {
    enabled: boolean;
    counterpart?: Open<'live' | 'synthetic'>;
    fakeLocation?: LatLng | null;
    relaxCheckin?: boolean;
    simulatedPayments?: boolean;
    stepDelayS?: number[]; // [min, max] seconds between visible Muse steps
  };
}
export interface InterestRef {
  id: string;
  label: string;
  path: string[];
  level: number;
}
export interface MyInterest {
  interest: InterestRef;
  weight: number;
  visibility: Visibility;
  sensitive: boolean;
  source: Open<'activity' | 'connector' | 'muse_bar' | 'manual'>;
  evidence?: string;
}
export interface AvailabilitySlot {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  part: 'morning' | 'afternoon' | 'evening';
}
export interface GroupSize {
  min: number;
  max: number;
}
export interface TravelPrefs {
  maxMinutes: number;
  modes: TravelMode[];
}
export interface MuseSettings {
  spendWithoutAskingCents: number;
  autoReschedule: boolean;
  autoBackfill: boolean;
  calendarHolds: boolean;
  leaveByReminders: boolean;
}
export interface Capabilities {
  canCreatePlans: boolean;
  maxGroupSize: number;
  groupOnly: boolean;
  openJoinsMax: number;
}
export interface Unlock {
  unlockId: string;
  label: string;
  description?: string;
  earnedAt: string;
}
export interface Rewards {
  confirmedMeetups: number;
  streakWeeks: number;
  nextUnlock?: { unlockId: string; label: string; remaining: number } | null;
}
export interface Me {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  profileVisibility: ProfileVisibility;
  optedIn: boolean;
  setupComplete: boolean;
  mode?: Mode | null;
  poolId?: string | null;
  neighborhood?: string | null;
  groupSize: GroupSize;
  availability: AvailabilitySlot[];
  travel: TravelPrefs;
  interests: MyInterest[];
  museSettings: MuseSettings;
  capabilities: Capabilities;
  unlocks: Unlock[];
  rewards?: Rewards;
}
export interface MeUpdate {
  profileVisibility?: ProfileVisibility;
  neighborhood?: string;
  groupSize?: GroupSize;
  availability?: AvailabilitySlot[];
  travel?: TravelPrefs;
  museSettings?: MuseSettings;
}
export interface Venue {
  venueId: string;
  name: string;
  neighborhood?: string;
  address?: string;
  location: LatLng;
  kind: string;
  photoUrl?: string | null;
}
export interface Signal {
  signalId: string;
  provider: string;
  kind: Open<
    'frequent_place' | 'saved_place' | 'routine' | 'ticket' | 'artist' | 'post' | 'life_event'
  >;
  label: string;
  interests: InterestRef[];
  venue?: Venue | null;
  observedAt: string;
  visibility: Visibility;
  sensitive: boolean;
}
export interface Setup {
  museText: string;
  proposedInterests: MyInterest[];
  signals: Signal[];
  proposedGroupSize: GroupSize;
  proposedTravel: TravelPrefs;
  suggestedProviders: string[];
}
export interface SetupComplete {
  acceptedInterestIds: string[];
  hiddenInterestIds: string[];
  groupSize: GroupSize;
  travel: TravelPrefs;
  availability?: AvailabilitySlot[];
  profileVisibility: ProfileVisibility;
  neighborhood?: string;
}
export interface Connector {
  provider: string;
  label: string;
  reads: string;
  status: Open<'connected' | 'not_connected' | 'coming_soon'>;
  simulated: boolean;
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  signalCount: number;
}
export interface Because {
  source: string;
  label: string;
  signalId?: string | null;
}
export interface BusyBlock {
  start: string;
  end: string;
}
export type Desired = 'none' | 'hold' | 'event';
export interface CalendarDirective {
  key: string;
  desired: Desired;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  notes?: string | null;
}
export interface CalendarApplied {
  key: string;
  desired: Desired;
  ok: boolean;
}
export interface CalendarSync {
  source: 'device_calendar';
  horizonStart: string;
  horizonEnd: string;
  busy: BusyBlock[];
  applied: CalendarApplied[];
}
export interface CalendarSyncResult {
  acceptedBusy: number;
  directives: CalendarDirective[];
}
export interface Cost {
  kind: Open<'free' | 'pay_at_venue' | 'prepaid'>;
  perPersonCents: number;
  currency: string;
  label: string;
}
export interface Travel {
  mode: TravelMode;
  minutes: number;
  label: string;
}
export interface Directions {
  apple: string;
  google: string;
}
export interface PlanCheck {
  kind: Open<'calendar' | 'travel' | 'spots' | 'cost' | 'weather'>;
  ok: boolean;
  label: string;
}
export interface Crowd {
  interestedCount: number;
  spotsLeft: number;
  sharedWithYou: { interest: InterestRef; count: number }[];
}
export type PlanStatus = Open<'open' | 'full' | 'closed' | 'cancelled'>;
export type JoinStatus = Open<'interested' | 'matched' | 'not_filled' | 'withdrawn'>;
export interface PlanCard {
  planId: string;
  title: string;
  activityType: string;
  venue: Venue;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  cost: Cost;
  size: GroupSize;
  crowd: Crowd;
  travel?: Travel | null;
  checks: PlanCheck[];
  reason: string;
  because: Because[];
  origin: Open<'muse' | 'nudge' | 'user' | 'invite'>;
  status: PlanStatus;
  myJoin?: { joinId: string; status: JoinStatus } | null;
}
export interface PlanDetail extends PlanCard {
  description: string;
  museWillHandle: string[];
  safety: string[];
  formsAt: string;
  alternatives: { planId: string; title: string; startsAt: string }[];
  directions: Directions;
}
export interface MuseReply {
  conversationId: string;
  reply: { messageId: string; text: string; createdAt: string };
  plans: PlanCard[];
  createdPlanId?: string | null;
  prompts: string[];
}
export interface Feed {
  generatedAt: string;
  nextRefreshAt: string;
  museStatus?: string | null;
  prompts: string[];
  plans: PlanCard[];
}
export interface Join {
  joinId: string;
  planId: string;
  plan?: PlanCard;
  status: JoinStatus;
  progress: { joined: number; needed: number };
  meetupId?: string | null;
  formsAt: string;
  createdAt: string;
  alternatives: string[];
  calendar?: CalendarDirective | null;
}
export type NudgeSurface = Open<'plans' | 'home' | 'events'>;
export interface Nudge {
  nudgeId: string;
  title: string;
  text: string;
  because: Because[];
  planId: string;
  surfaces: NudgeSurface[];
  createdAt: string;
  expiresAt: string;
}
export interface PersonCard {
  userId: string;
  displayName?: string | null;
  initials: string;
  avatarUrl?: string | null;
  profileVisibility: ProfileVisibility;
}
export type MuseStepStatus = Open<
  'queued' | 'running' | 'done' | 'needs_you' | 'failed' | 'skipped'
>;
export interface MuseStep {
  stepId: string;
  kind: Open<
    | 'group_chat'
    | 'find_time'
    | 'choose_venue'
    | 'check_availability'
    | 'payment'
    | 'book'
    | 'calendar'
    | 'event'
    | 'reminder'
    | 'reschedule'
    | 'backfill'
    | 'cancel'
    | 'refund'
  >;
  status: MuseStepStatus;
  label: string;
  detail?: string | null;
  approvalId?: string | null;
  at: string;
}
export interface Approval {
  approvalId: string;
  meetupId: string;
  kind: Open<'payment' | 'change' | 'plus_one'>;
  status: Open<'pending' | 'approved' | 'declined' | 'expired'>;
  title: string;
  detail: string;
  amountCents?: number | null;
  currency?: string | null;
  payee?: string | null;
  simulated: boolean;
  fallback: string;
  expiresAt: string;
}
export interface Booking {
  status: Open<'not_needed' | 'not_booked' | 'holding' | 'booked' | 'pay_at_venue' | 'failed'>;
  label: string;
  provider: string;
  confirmationCode?: string | null;
}
export interface MeetupCost extends Cost {
  myPayment: Open<'not_needed' | 'pending_approval' | 'paid' | 'pay_at_venue' | 'declined'>;
}
export interface MeetupTravel extends Travel {
  leaveBy: string;
  directions: Directions;
}
export interface Attendee {
  person: PersonCard;
  isMe: boolean;
  rsvp: Open<'going' | 'left'>;
  checkedIn: boolean;
  status?: AttendeeStatus | null;
  sharedInterests: InterestRef[];
}
export type MeetupStatus = Open<'setting_up' | 'confirmed' | 'completed' | 'cancelled'>;
export interface Meetup {
  meetupId: string;
  planId: string;
  threadId: string;
  title: string;
  activityType: string;
  status: MeetupStatus;
  venue: Venue;
  startsAt: string;
  endsAt: string;
  attendees: Attendee[];
  museSteps: MuseStep[];
  approvals: Approval[];
  booking: Booking;
  cost: MeetupCost;
  calendar?: CalendarDirective | null;
  travel?: MeetupTravel | null;
  checkinWindow?: { opensAt: string; closesAt: string } | null;
  feedbackDue: boolean;
  eventLabel?: string | null;
}
export interface CheckinResult {
  accepted: boolean;
  reason?: Open<'outside_geofence' | 'outside_window' | 'not_attendee'>;
}
export interface Feedback {
  answers: { userId: string; showedUp: boolean; meetAgain: boolean }[];
  note?: string;
  reportUserIds?: string[];
}
export interface Connection {
  connectionId: string;
  person: PersonCard;
  sharedInterests: InterestRef[];
  status: Open<'new' | 'met'>;
  meetupsTogether: number;
  connectedAt: string;
  firstMetAt?: string | null;
  canViewProfile: boolean;
  canPlanAgain: boolean;
}
export interface PublicProfile {
  person: PersonCard;
  bio?: string | null;
  neighborhood?: string | null;
  sharedInterests: InterestRef[];
  meetupsTogether?: number;
}
export interface Thread {
  threadId: string;
  kind: Open<'group' | 'direct'>;
  title: string;
  participants: PersonCard[];
  lastMessage?: Message | null;
  unreadCount: number;
  updatedAt: string;
  meetupId?: string | null;
}
// Open union keyed by `kind`; render known kinds, skip the rest (CONTRACTS §3 rule 4).
export interface MessageAttachment {
  kind: Open<'starters' | 'meetup' | 'muse_steps' | 'approval' | 'plan'>;
  starters?: string[];
  meetupId?: string;
  stepIds?: string[];
  approvalId?: string;
  planId?: string;
}
export interface Message {
  messageId: string;
  threadId: string;
  sender: { kind: Open<'user' | 'muse' | 'system'>; userId?: string | null };
  text: string;
  createdAt: string;
  clientId?: string | null;
  toMuse?: boolean;
  attachments: MessageAttachment[];
}
export interface ReportRequest {
  userId: string;
  reason: 'threat' | 'harassment' | 'no_show_pattern' | 'fake_account' | 'other';
  text?: string;
  threadId?: string;
  meetupId?: string;
}
export interface RealtimeEvent {
  type: string;
  eventId: string;
  at: string;
  data: Record<string, unknown>;
}

// Tolerant decoders (CONTRACTS §3): shallow copy, default required arrays to [] and
// required objects to {}, never throw. Unknown fields and enum values pass through.
type Obj = Record<string, unknown>;
type D = (json: unknown) => unknown;
const o = (json: unknown): Obj =>
  json && typeof json === 'object' && !Array.isArray(json) ? { ...(json as Obj) } : {};
const a = (value: unknown, each: D = (x) => x) => (Array.isArray(value) ? value.map(each) : []);
// Copy `x`, mapping the listed array keys with their decoder (missing array -> []).
const arrays =
  (spec: Record<string, D | null>): D =>
  (json) => {
    const x = o(json);
    for (const [k, each] of Object.entries(spec)) x[k] = a(x[k], each ?? undefined);
    return x;
  };
const id: D = (json) => json;
const nested =
  (key: string, inner: D): D =>
  (json) => {
    const x = o(json);
    if (x[key] != null) x[key] = inner(x[key]);
    return x;
  };
const pipe =
  (...fs: D[]): D =>
  (json) =>
    fs.reduce((v, f) => f(v), json);

const signal = arrays({ interests: null });
const crowd = arrays({ sharedWithYou: null });
const planCard = pipe(arrays({ checks: null, because: null }), (x) => ({
  ...(x as Obj),
  crowd: crowd((x as Obj).crowd),
}));
const planDetail = pipe(
  planCard,
  arrays({ museWillHandle: null, safety: null, alternatives: null }),
);
const join = pipe(arrays({ alternatives: null }), nested('plan', planCard));
const nudge = arrays({ because: null, surfaces: null });
const attendee = arrays({ sharedInterests: null });
const meetup = arrays({ attendees: attendee, museSteps: null, approvals: null });
const message = arrays({ attachments: null });
const thread = pipe(arrays({ participants: null }), nested('lastMessage', message));
const connection = arrays({ sharedInterests: null });
const me = arrays({ availability: null, interests: null, unlocks: null });
const list = (each: D): D => arrays({ items: each });

// Keyed by operationId; operations with no JSON body (204) are absent.
export const decoders: Record<string, D> = {
  getHealth: id,
  getConfig: (json) => {
    const x = arrays({ modes: null })(json) as Obj;
    return { ...x, features: o(x.features), limits: o(x.limits), demo: o(x.demo) };
  },
  getMe: me,
  updateMe: me,
  optIn: me,
  completeSetup: me,
  setInterestVisibility: id,
  getSetup: arrays({ proposedInterests: null, signals: signal, suggestedProviders: null }),
  listConnectors: list(id),
  connectConnector: id,
  listSignals: list(signal),
  setSignalVisibility: signal,
  syncCalendar: arrays({ directives: null }),
  askMuse: arrays({ plans: planCard, prompts: null }),
  getFeed: arrays({ prompts: null, plans: planCard }),
  getPlan: planDetail,
  createPlan: planDetail,
  joinPlan: join,
  listJoins: list(join),
  listNudges: list(nudge),
  listMeetups: list(meetup),
  getMeetup: meetup,
  leaveMeetup: meetup,
  setMeetupStatus: meetup,
  checkIn: id,
  listApprovals: list(id),
  decideApproval: id,
  listConnections: list(connection),
  getPerson: arrays({ sharedInterests: null }),
  listThreads: list(thread),
  getThread: thread,
  listMessages: list(message),
  sendMessage: message,
  report: id,
};
// Realtime frames: unknown types pass through so the caller can skip them.
export const decodeEvent = (json: unknown): RealtimeEvent => {
  const x = o(json);
  return { ...x, type: String(x.type ?? ''), data: o(x.data) } as RealtimeEvent;
};
