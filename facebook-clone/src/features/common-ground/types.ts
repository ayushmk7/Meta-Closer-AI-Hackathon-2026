// Hand-written mirror of contracts/openapi.yaml (v1). Open enums accept any string.
type Open<T extends string> = T | (string & {});

export interface LatLng {
  lat: number;
  lng: number;
}
export type Mode = Open<'city' | 'event' | 'campus' | 'group' | 'arriving' | 'cohort'>;
export type ProfileVisibility = 'public' | 'private';
export type Precision = 'exact' | 'neighborhood';
export type SharePrecision = Precision | 'off';
export type AttendeeStatus = 'on_my_way' | 'arrived';

export interface ModeInfo {
  mode: Mode;
  label: string;
  poolId: string;
  available: boolean;
  description?: string;
  center?: LatLng;
  radiusKm?: number;
}
export interface Config {
  apiVersion: string;
  features: Record<string, boolean | undefined>;
  limits: {
    dropMax: number;
    sharedCoarseMax: number;
    sharedFullMax?: number;
    openersPerPersonPerWeek: number;
    openerMaxChars: number;
    messageMaxChars: number;
    groupSizeMin: number;
    groupSizeMax: number;
    locationMinIntervalS: number;
    pollIntervalS: number;
    mapRefreshS: number;
    meetupStatusBeforeMin?: number;
  };
  modes: ModeInfo[];
  demo: {
    enabled: boolean;
    counterpart?: Open<'live' | 'synthetic'>;
    fakeLocation?: LatLng | null;
    relaxCheckin?: boolean;
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
  visibility: 'shown' | 'hidden';
  sensitive: boolean;
  source: Open<'activity' | 'onboarding' | 'manual' | 'scene'>;
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
export interface Me {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  profileVisibility: ProfileVisibility;
  optedIn: boolean;
  mode?: Mode | null;
  poolId?: string | null;
  neighborhood?: string | null;
  groupSize: GroupSize;
  availability: AvailabilitySlot[];
  ghostMode: boolean;
  interests: MyInterest[];
  capabilities: { canHost: boolean; maxGroupSize: number; groupOnly: boolean; dailySlots: number };
  unlocks: { unlockId: string; label: string; description?: string; earnedAt: string }[];
}
export interface MeUpdate {
  profileVisibility?: ProfileVisibility;
  neighborhood?: string;
  groupSize?: GroupSize;
  availability?: AvailabilitySlot[];
}
export interface OnboardingMessage {
  messageId: string;
  role: Open<'muse' | 'user'>;
  text: string;
  createdAt: string;
}
export interface OnboardingSession {
  sessionId: string;
  status: Open<'chatting' | 'review' | 'complete'>;
  messages: OnboardingMessage[]; // on start the full history; on a send only the new messages
  proposedInterests: MyInterest[];
  proposedGroupSize?: GroupSize;
  proposedAvailability?: AvailabilitySlot[];
}
export interface OnboardingComplete {
  acceptedInterestIds: string[];
  hiddenInterestIds: string[];
  groupSize: GroupSize;
  availability: AvailabilitySlot[];
  profileVisibility: ProfileVisibility;
  neighborhood?: string;
}
export interface DensityBin {
  binId: string;
  count: number;
  polygon: LatLng[];
}
export interface Density {
  poolId: string;
  totalLooking: number;
  minBinCount: number;
  bins: DensityBin[];
}
export interface PersonCard {
  userId: string;
  displayName?: string | null;
  initials: string;
  avatarUrl?: string | null; // 'asset:<mediaKey>' in the in-app mock
  profileVisibility: ProfileVisibility;
}
export interface DropCard {
  suggestionId: string;
  person: PersonCard;
  distanceBand: Open<'under_1km' | '1_3km' | '3_10km' | 'over_10km'>;
  sharedInterests: InterestRef[];
  reason: string;
  state: Open<'open' | 'connect_sent' | 'connected' | 'passed' | 'expired'>;
  hiAvailable: boolean;
}
export interface Drop {
  dropId: string;
  poolId: string;
  generatedAt: string;
  expiresAt: string;
  nextDropAt: string;
  cards: DropCard[];
}
export interface DecisionResult {
  suggestionId: string;
  state: Open<'connect_sent' | 'connected' | 'passed' | 'expired'>;
  connection?: Connection | null;
}
export interface HiResult {
  hiId: string | null;
  status: Open<'delivered' | 'rejected'>;
  rejectionReason?: Open<'screened' | 'limit' | 'not_allowed'>;
}
export interface HiItem {
  hiId: string;
  from: PersonCard;
  sharedInterests: InterestRef[];
  text: string;
  receivedAt: string;
}
export interface GroupRequest {
  groupRequestId: string;
  status: Open<'inviting' | 'formed' | 'fallback_1to1' | 'failed'>;
  invitedCount: number;
  acceptedCount: number;
  size: GroupSize;
  threadId?: string | null;
}
export interface Invite {
  inviteId: string;
  from: PersonCard;
  sharedInterests: InterestRef[];
  size: GroupSize;
  status: Open<'pending' | 'accepted' | 'declined' | 'expired'>;
  expiresAt: string;
  threadId?: string | null;
}
export interface LocationShareState {
  iShare: SharePrecision;
  theyShare: SharePrecision;
  viewing: Precision;
}
export interface Connection {
  connectionId: string;
  person: PersonCard;
  sharedInterests: InterestRef[];
  threadId: string;
  status: Open<'new' | 'met'>;
  connectedAt: string;
  firstMetAt?: string | null;
  location: LocationShareState;
  canViewProfile: boolean;
}
export interface PublicProfile {
  person: PersonCard;
  bio?: string | null;
  neighborhood?: string | null;
  sharedInterests: InterestRef[];
  meetupsTogether?: number;
}
export interface MessageAttachment {
  kind: Open<'starters' | 'meetup'>;
  starters?: string[];
  meetupId?: string;
}
export interface Message {
  messageId: string;
  threadId: string;
  sender: { kind: Open<'user' | 'muse' | 'system'>; userId?: string | null };
  text: string;
  createdAt: string;
  clientId?: string | null;
  attachments: MessageAttachment[];
}
export interface Thread {
  threadId: string;
  kind: Open<'direct' | 'group'>;
  title: string;
  participants: PersonCard[];
  lastMessage?: Message | null;
  unreadCount: number;
  updatedAt: string;
  activeMeetupId?: string | null;
}
export interface Venue {
  venueId: string;
  name: string;
  neighborhood?: string;
  location: LatLng;
  kind: string;
}
export interface MeetupOption {
  optionId: string;
  activity: string;
  venue: Venue;
  startsAt: string;
  endsAt: string;
  reason: string;
  votes: { yes: number; no: number };
  myVote?: 'yes' | 'no' | null;
}
export interface Attendee {
  userId: string;
  rsvp: Open<'yes' | 'no' | 'pending'>;
  checkedIn: boolean;
  status?: AttendeeStatus | null;
}
export interface Meetup {
  meetupId: string;
  threadId: string;
  status: Open<'proposing' | 'voting' | 'confirmed' | 'completed' | 'cancelled'>;
  organizerId: string;
  size: GroupSize;
  title?: string | null;
  chosenOptionId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  venue?: Venue | null;
  options: MeetupOption[];
  attendees: Attendee[];
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
export interface FriendPin {
  userId: string;
  person: PersonCard;
  precision: Precision;
  location: LatLng; // neighborhood centroid when precision is 'neighborhood'
  radiusM: number;
  sharedInterests: InterestRef[];
  meetupStatus?: AttendeeStatus | null;
  threadId: string;
  updatedAt: string;
}
export interface TrayItem {
  userId: string;
  person: PersonCard;
  reason: Open<'not_sharing' | 'not_met' | 'ghost'>;
  threadId: string;
  sharedInterests: InterestRef[];
}
export interface MeetupPin {
  meetupId: string;
  title: string;
  venue: Venue;
  startsAt: string;
  attendeeCount: number;
}
export interface MapView {
  generatedAt: string;
  me: { location?: LatLng | null; ghostMode: boolean };
  friends: FriendPin[];
  tray: TrayItem[];
  meetups: MeetupPin[];
}
export interface ReportRequest {
  userId: string;
  reason: Open<'threat' | 'harassment' | 'no_show_pattern' | 'fake_account' | 'other'>;
  text?: string;
  threadId?: string;
  meetupId?: string;
}

// Tolerant decoders (CONTRACTS §3): shallow copy, default required arrays to [], never throw.
// ponytail: no schema library; unknown enums are handled at render with lookup-with-fallback.
type Obj = Record<string, unknown>;
const o = (json: unknown): Obj => (json && typeof json === 'object' ? { ...(json as Obj) } : {});
const a = (value: unknown, each: (json: unknown) => unknown = (x) => x) =>
  Array.isArray(value) ? value.map(each) : [];
const shared = (json: unknown) => {
  const x = o(json);
  return { ...x, sharedInterests: a(x.sharedInterests) };
};
const message = (json: unknown) => {
  const x = o(json);
  return { ...x, attachments: a(x.attachments) };
};
const connection = shared;
const thread = (json: unknown) => {
  const x = o(json);
  return {
    ...x,
    participants: a(x.participants),
    lastMessage: x.lastMessage ? message(x.lastMessage) : null,
  };
};
const meetup = (json: unknown) => {
  const x = o(json);
  return { ...x, options: a(x.options), attendees: a(x.attendees) };
};
const me = (json: unknown) => {
  const x = o(json);
  return {
    ...x,
    interests: a(x.interests),
    availability: a(x.availability),
    unlocks: a(x.unlocks),
  };
};
const session = (json: unknown) => {
  const x = o(json);
  return { ...x, messages: a(x.messages), proposedInterests: a(x.proposedInterests) };
};
const list = (each: (json: unknown) => unknown) => (json: unknown) => {
  const x = o(json);
  return { ...x, items: a(x.items, each) };
};
const id = (json: unknown) => json;

export const decoders: Record<string, (json: unknown) => unknown> = {
  getConfig: (json) => {
    const x = o(json);
    return {
      ...x,
      features: o(x.features),
      limits: o(x.limits),
      modes: a(x.modes),
      demo: o(x.demo),
    };
  },
  getMe: me,
  updateMe: me,
  optIn: me,
  completeOnboarding: me,
  setInterestVisibility: id,
  startOnboarding: session,
  sendOnboardingMessage: session,
  getDensity: (json) => {
    const x = o(json);
    return { ...x, bins: a(x.bins, (b) => ({ ...o(b), polygon: a(o(b).polygon) })) };
  },
  getCurrentDrop: (json) => {
    const x = o(json);
    return { ...x, cards: a(x.cards, shared) };
  },
  decideSuggestion: (json) => {
    const x = o(json);
    return { ...x, connection: x.connection ? connection(x.connection) : null };
  },
  sayHi: id,
  listHi: list(shared),
  replyHi: connection,
  requestGroup: id,
  getGroupRequest: id,
  listInvites: list(shared),
  decideInvite: shared,
  listConnections: list(connection),
  getPerson: shared,
  listThreads: list(thread),
  getThread: thread,
  listMessages: list(message),
  sendMessage: message,
  planMeetup: meetup,
  listMeetups: list(meetup),
  getMeetup: meetup,
  voteMeetup: meetup,
  setMeetupStatus: meetup,
  checkIn: id,
  getMap: (json) => {
    const x = o(json);
    return {
      ...x,
      me: o(x.me),
      friends: a(x.friends, shared),
      tray: a(x.tray, shared),
      meetups: a(x.meetups),
    };
  },
  setLocationShare: id,
  setLocationView: id,
  report: id,
};
