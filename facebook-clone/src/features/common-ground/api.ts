import { mockRequest } from './mock';
import {
  decoders,
  type CheckinResult,
  type Config,
  type Connection,
  type DecisionResult,
  type Density,
  type Drop,
  type Feedback,
  type GroupRequest,
  type GroupSize,
  type HiItem,
  type HiResult,
  type Invite,
  type LatLng,
  type LocationShareState,
  type MapView,
  type Me,
  type MeUpdate,
  type Meetup,
  type Message,
  type Mode,
  type MyInterest,
  type OnboardingComplete,
  type OnboardingSession,
  type PublicProfile,
  type ReportRequest,
  type Thread,
} from './types';

export class CgError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  constructor(status: number, code: string, message: string, retryable: boolean) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

// Literal process.env.EXPO_PUBLIC_* reads so Metro inlines them.
const BASE = process.env.EXPO_PUBLIC_CG_API_URL;
export const MOCK: boolean = process.env.EXPO_PUBLIC_CG_MOCK === '1' || !BASE;

let user: string | null = null;
export function setUser(userId: string | null): void {
  user = userId;
}
export function getUser(): string {
  return user ?? process.env.EXPO_PUBLIC_CG_USER ?? 'u_maya';
}

const KNOWN = [
  'unauthenticated',
  'not_found',
  'validation_failed',
  'not_allowed',
  'rate_limited',
  'conflict',
  'not_opted_in',
  'muse_unavailable',
  'laya_unavailable',
  'unavailable',
  'internal',
];
const BY_STATUS: Record<number, string> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  403: 'not_allowed',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
};
function toError(status: number, json: unknown): CgError {
  const e =
    (json as { error?: { code?: string; message?: string; retryable?: boolean } } | null)?.error ??
    {};
  const code =
    e.code && KNOWN.includes(e.code)
      ? e.code
      : (BY_STATUS[status] ?? (status >= 500 ? 'unavailable' : 'internal'));
  return new CgError(
    status,
    code,
    e.message ?? 'Something went wrong. Try again.',
    e.retryable ?? status >= 500,
  );
}

async function request<T>(
  operationId: string,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 10_000,
): Promise<T> {
  let json: unknown;
  if (MOCK) {
    try {
      json = await mockRequest(getUser(), method, path, body);
    } catch (e) {
      throw toError((e as { status?: number }).status ?? 500, e);
    }
  } else {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const res = await fetch(BASE + path, {
        method,
        headers: {
          'X-CG-User': getUser(),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: abort.signal,
      });
      const text = await res.text();
      json = text ? JSON.parse(text) : undefined;
      if (!res.ok) throw toError(res.status, json);
    } catch (e) {
      if (e instanceof CgError) throw e;
      throw abort.signal.aborted
        ? new CgError(0, 'timeout', 'That took too long. Try again.', true)
        : new CgError(
            0,
            'unavailable',
            'Could not reach Common Ground. Check your connection.',
            true,
          );
    } finally {
      clearTimeout(timer);
    }
  }
  const decode = decoders[operationId] as ((json: unknown) => unknown) | undefined;
  return (decode && json !== undefined ? decode(json) : json) as T;
}
const items = <T>(p: Promise<{ items: T[] }>) => p.then((r) => r.items);
const e = encodeURIComponent;

export const api = {
  getConfig: () => request<Config>('getConfig', 'GET', '/v1/config'),
  getMe: () => request<Me>('getMe', 'GET', '/v1/me'),
  updateMe: (patch: MeUpdate) => request<Me>('updateMe', 'PATCH', '/v1/me', patch),
  setInterestVisibility: (interestId: string, visibility: 'shown' | 'hidden') =>
    request<MyInterest>('setInterestVisibility', 'PUT', `/v1/me/interests/${e(interestId)}`, {
      visibility,
    }),
  removeInterest: (interestId: string) =>
    request<void>('removeInterest', 'DELETE', `/v1/me/interests/${e(interestId)}`),
  optIn: (mode: Mode, poolId?: string) =>
    request<Me>('optIn', 'POST', '/v1/optin', { mode, poolId }),
  optOut: () => request<void>('optOut', 'DELETE', '/v1/optin'),
  startOnboarding: () =>
    request<OnboardingSession>('startOnboarding', 'POST', '/v1/onboarding/sessions'),
  sendOnboardingMessage: (sessionId: string, text: string) =>
    request<OnboardingSession>(
      'sendOnboardingMessage',
      'POST',
      `/v1/onboarding/sessions/${e(sessionId)}/messages`,
      { text },
      30_000,
    ),
  completeOnboarding: (sessionId: string, body: OnboardingComplete) =>
    request<Me>(
      'completeOnboarding',
      'POST',
      `/v1/onboarding/sessions/${e(sessionId)}/complete`,
      body,
    ),
  getDensity: (poolId: string) =>
    request<Density>('getDensity', 'GET', `/v1/pools/${e(poolId)}/density`),
  getCurrentDrop: () => request<Drop>('getCurrentDrop', 'GET', '/v1/drops/current'),
  decideSuggestion: (suggestionId: string, decision: 'connect' | 'pass') =>
    request<DecisionResult>(
      'decideSuggestion',
      'POST',
      `/v1/suggestions/${e(suggestionId)}/decision`,
      { decision },
    ),
  sayHi: (suggestionId: string, text: string) =>
    request<HiResult>('sayHi', 'POST', `/v1/suggestions/${e(suggestionId)}/hi`, { text }),
  listHi: () => items(request<{ items: HiItem[] }>('listHi', 'GET', '/v1/hi')),
  replyHi: (hiId: string, text: string) =>
    request<Connection>('replyHi', 'POST', `/v1/hi/${e(hiId)}/reply`, { text }),
  dismissHi: (hiId: string) => request<void>('dismissHi', 'POST', `/v1/hi/${e(hiId)}/dismiss`),
  requestGroup: (suggestionIds: string[], size: GroupSize) =>
    request<GroupRequest>('requestGroup', 'POST', '/v1/groups', { suggestionIds, size }),
  getGroupRequest: (id: string) =>
    request<GroupRequest>('getGroupRequest', 'GET', `/v1/groups/${e(id)}`),
  listInvites: () => items(request<{ items: Invite[] }>('listInvites', 'GET', '/v1/invites')),
  decideInvite: (inviteId: string, decision: 'accept' | 'decline') =>
    request<Invite>('decideInvite', 'POST', `/v1/invites/${e(inviteId)}/decision`, { decision }),
  listConnections: () =>
    items(request<{ items: Connection[] }>('listConnections', 'GET', '/v1/connections')),
  getPerson: (userId: string) =>
    request<PublicProfile>('getPerson', 'GET', `/v1/people/${e(userId)}`),
  listThreads: () => items(request<{ items: Thread[] }>('listThreads', 'GET', '/v1/threads')),
  getThread: (threadId: string) =>
    request<Thread>('getThread', 'GET', `/v1/threads/${e(threadId)}`),
  listMessages: (threadId: string, after?: string) =>
    items(
      request<{ items: Message[] }>(
        'listMessages',
        'GET',
        `/v1/threads/${e(threadId)}/messages${after ? `?after=${e(after)}` : ''}`,
      ),
    ),
  sendMessage: (threadId: string, text: string, clientId: string) =>
    request<Message>('sendMessage', 'POST', `/v1/threads/${e(threadId)}/messages`, {
      text,
      clientId,
    }),
  markThreadRead: (threadId: string) =>
    request<void>('markThreadRead', 'POST', `/v1/threads/${e(threadId)}/read`),
  planMeetup: (threadId: string, body: { size?: GroupSize; note?: string } = {}) =>
    request<Meetup>('planMeetup', 'POST', `/v1/threads/${e(threadId)}/plan`, body, 30_000),
  listMeetups: () => items(request<{ items: Meetup[] }>('listMeetups', 'GET', '/v1/meetups')),
  getMeetup: (meetupId: string) =>
    request<Meetup>('getMeetup', 'GET', `/v1/meetups/${e(meetupId)}`),
  voteMeetup: (meetupId: string, votes: { optionId: string; vote: 'yes' | 'no' }[]) =>
    request<Meetup>('voteMeetup', 'POST', `/v1/meetups/${e(meetupId)}/votes`, { votes }),
  setMeetupStatus: (meetupId: string, status: 'on_my_way' | 'arrived') =>
    request<Meetup>('setMeetupStatus', 'PUT', `/v1/meetups/${e(meetupId)}/my-status`, { status }),
  checkIn: (meetupId: string, location: LatLng) =>
    request<CheckinResult>('checkIn', 'POST', `/v1/meetups/${e(meetupId)}/checkin`, { location }),
  sendFeedback: (meetupId: string, feedback: Feedback) =>
    request<void>('sendFeedback', 'POST', `/v1/meetups/${e(meetupId)}/feedback`, feedback),
  getMap: () => request<MapView>('getMap', 'GET', '/v1/map'),
  updateLocation: (location: LatLng) =>
    request<void>('updateLocation', 'PUT', '/v1/location', {
      location,
      capturedAt: new Date().toISOString(),
    }),
  setLocationShare: (userId: string, maxPrecision: 'off' | 'neighborhood' | 'exact') =>
    request<LocationShareState>('setLocationShare', 'PUT', `/v1/location/shares/${e(userId)}`, {
      maxPrecision,
    }),
  setLocationView: (userId: string, precision: 'neighborhood' | 'exact') =>
    request<LocationShareState>('setLocationView', 'PUT', `/v1/location/views/${e(userId)}`, {
      precision,
    }),
  setGhostMode: (enabled: boolean) =>
    request<void>('setGhostMode', 'PUT', '/v1/location/ghost', { enabled }),
  report: (body: ReportRequest) =>
    request<{ reportId: string }>('report', 'POST', '/v1/reports', body),
  block: (userId: string) => request<void>('block', 'POST', '/v1/blocks', { userId }),
};
