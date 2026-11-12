import { mockRequest } from './mock';
import {
  decoders,
  type Approval,
  type CalendarSync,
  type CalendarSyncResult,
  type CheckinResult,
  type Config,
  type Connection,
  type Connector,
  type Feed,
  type Feedback,
  type GroupSize,
  type Health,
  type Join,
  type LatLng,
  type Me,
  type MeUpdate,
  type Meetup,
  type Message,
  type Mode,
  type MuseReply,
  type MyInterest,
  type Nudge,
  type NudgeSurface,
  type PlanDetail,
  type PublicProfile,
  type ReportRequest,
  type Setup,
  type SetupComplete,
  type Signal,
  type Thread,
  type Visibility,
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
// D5: web always runs on the in-app mock (RN native has no `document`).
export const MOCK: boolean =
  process.env.EXPO_PUBLIC_CG_MOCK === '1' || !BASE || typeof document !== 'undefined';
export const wsUrl = (): string | null =>
  MOCK || !BASE
    ? null
    : `${BASE.replace(/^http/, 'ws')}/v1/ws?user=${encodeURIComponent(getUser())}`;

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
  'screened',
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
  422: 'screened',
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
const LONG = 30_000; // CONTRACTS §3 rule 9

// One method per openapi.yaml operationId (except the `realtime` WebSocket, see realtime.ts).
export const api = {
  getHealth: () => request<Health>('getHealth', 'GET', '/v1/health'),
  getConfig: () => request<Config>('getConfig', 'GET', '/v1/config'),
  getMe: () => request<Me>('getMe', 'GET', '/v1/me'),
  updateMe: (patch: MeUpdate) => request<Me>('updateMe', 'PATCH', '/v1/me', patch),
  setInterestVisibility: (interestId: string, visibility: Visibility) =>
    request<MyInterest>('setInterestVisibility', 'PUT', `/v1/me/interests/${e(interestId)}`, {
      visibility,
    }),
  removeInterest: (interestId: string) =>
    request<void>('removeInterest', 'DELETE', `/v1/me/interests/${e(interestId)}`),
  optIn: (mode: Mode, poolId?: string) =>
    request<Me>('optIn', 'POST', '/v1/optin', { mode, poolId }),
  optOut: () => request<void>('optOut', 'DELETE', '/v1/optin'),
  getSetup: () => request<Setup>('getSetup', 'GET', '/v1/me/setup'),
  completeSetup: (body: SetupComplete) =>
    request<Me>('completeSetup', 'POST', '/v1/me/setup', body),
  listConnectors: () =>
    items(request<{ items: Connector[] }>('listConnectors', 'GET', '/v1/connectors')),
  connectConnector: (provider: string) =>
    request<Connector>(
      'connectConnector',
      'POST',
      `/v1/connectors/${e(provider)}`,
      undefined,
      LONG,
    ),
  disconnectConnector: (provider: string) =>
    request<void>('disconnectConnector', 'DELETE', `/v1/connectors/${e(provider)}`),
  listSignals: () => items(request<{ items: Signal[] }>('listSignals', 'GET', '/v1/signals')),
  setSignalVisibility: (signalId: string, visibility: Visibility) =>
    request<Signal>('setSignalVisibility', 'PUT', `/v1/signals/${e(signalId)}`, { visibility }),
  deleteSignal: (signalId: string) =>
    request<void>('deleteSignal', 'DELETE', `/v1/signals/${e(signalId)}`),
  syncCalendar: (body: CalendarSync) =>
    request<CalendarSyncResult>('syncCalendar', 'POST', '/v1/calendar/sync', body),
  askMuse: (text: string, conversationId?: string | null) =>
    request<MuseReply>('askMuse', 'POST', '/v1/muse/ask', { text, conversationId }, LONG),
  getFeed: () => request<Feed>('getFeed', 'GET', '/v1/feed'),
  getPlan: (planId: string) => request<PlanDetail>('getPlan', 'GET', `/v1/plans/${e(planId)}`),
  createPlan: (text: string, inviteUserIds?: string[]) =>
    request<PlanDetail>('createPlan', 'POST', '/v1/plans', { text, inviteUserIds }, LONG),
  joinPlan: (planId: string, body: { size?: GroupSize; plusOne?: boolean } = {}) =>
    request<Join>('joinPlan', 'POST', `/v1/plans/${e(planId)}/join`, body),
  withdrawJoin: (planId: string) =>
    request<void>('withdrawJoin', 'DELETE', `/v1/plans/${e(planId)}/join`),
  listJoins: () => items(request<{ items: Join[] }>('listJoins', 'GET', '/v1/joins')),
  listNudges: (surface?: NudgeSurface) =>
    items(
      request<{ items: Nudge[] }>(
        'listNudges',
        'GET',
        `/v1/nudges${surface ? `?surface=${e(surface)}` : ''}`,
      ),
    ),
  dismissNudge: (nudgeId: string, mute: 'none' | 'signal' = 'none') =>
    request<void>('dismissNudge', 'POST', `/v1/nudges/${e(nudgeId)}/dismiss`, { mute }),
  listMeetups: () => items(request<{ items: Meetup[] }>('listMeetups', 'GET', '/v1/meetups')),
  getMeetup: (meetupId: string) =>
    request<Meetup>('getMeetup', 'GET', `/v1/meetups/${e(meetupId)}`),
  leaveMeetup: (meetupId: string, note?: string) =>
    request<Meetup>('leaveMeetup', 'POST', `/v1/meetups/${e(meetupId)}/leave`, { note }),
  setMeetupStatus: (meetupId: string, status: 'on_my_way' | 'arrived') =>
    request<Meetup>('setMeetupStatus', 'PUT', `/v1/meetups/${e(meetupId)}/my-status`, { status }),
  checkIn: (meetupId: string, location: LatLng, accuracyM?: number) =>
    request<CheckinResult>('checkIn', 'POST', `/v1/meetups/${e(meetupId)}/checkin`, {
      location,
      accuracyM,
    }),
  sendFeedback: (meetupId: string, feedback: Feedback) =>
    request<void>('sendFeedback', 'POST', `/v1/meetups/${e(meetupId)}/feedback`, feedback),
  listApprovals: () =>
    items(request<{ items: Approval[] }>('listApprovals', 'GET', '/v1/approvals')),
  decideApproval: (approvalId: string, decision: 'approve' | 'decline') =>
    request<Approval>('decideApproval', 'POST', `/v1/approvals/${e(approvalId)}/decision`, {
      decision,
    }),
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
  sendMessage: (threadId: string, text: string, clientId: string, toMuse = false) =>
    request<Message>('sendMessage', 'POST', `/v1/threads/${e(threadId)}/messages`, {
      text,
      clientId,
      toMuse,
    }),
  markThreadRead: (threadId: string) =>
    request<void>('markThreadRead', 'POST', `/v1/threads/${e(threadId)}/read`),
  report: (body: ReportRequest) =>
    request<{ reportId: string }>('report', 'POST', '/v1/reports', body),
  block: (userId: string) => request<void>('block', 'POST', '/v1/blocks', { userId }),
};
