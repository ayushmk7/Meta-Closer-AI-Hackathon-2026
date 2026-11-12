import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { api } from '../../src/features/common-ground/api';
import { decodeEvent, decoders } from '../../src/features/common-ground/types';
import { mockRequest, resetMock } from '../../src/features/common-ground/mock';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- walking raw JSON
const spec: Json = JSON.parse(readFileSync(path.resolve('../contracts/openapi.json'), 'utf8'));
const ops = Object.entries(spec.paths as Json).flatMap(([p, methods]: [string, Json]) =>
  Object.entries(methods)
    .filter(([, op]) => op?.operationId)
    .map(([method, op]) => ({ ...(op as Json), method: method.toUpperCase(), path: p })),
) as Json[];
const success = (op: Json) =>
  Object.entries(op.responses ?? {}).find(([code]) => code.startsWith('2')) as
    [string, Json] | undefined;
const exampleOf = (op: Json) => success(op)?.[1].content?.['application/json']?.example;

test('fixtures.json is exactly the openapi 2xx examples (CG_WRITE_FIXTURES=1 regenerates)', () => {
  const file = path.resolve('src/features/common-ground/fixtures.json');
  const want = Object.fromEntries(
    ops.filter((op) => exampleOf(op) !== undefined).map((op) => [op.operationId, exampleOf(op)]),
  );
  if (process.env.CG_WRITE_FIXTURES === '1')
    writeFileSync(file, JSON.stringify(want, null, 1) + '\n');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), want);
});

test('the api client has a method for every operation except the WebSocket', () => {
  const missing = ops
    .map((op) => op.operationId as string)
    .filter((id) => id !== 'realtime' && !(id in api));
  assert.deepEqual(missing, []);
});

test('every JSON 2xx operation has a decoder, and every example decodes unchanged', () => {
  let checked = 0;
  for (const op of ops) {
    const res = success(op);
    if (!res?.[1].content?.['application/json']) continue;
    assert.ok(decoders[op.operationId], `no decoder for ${op.operationId}`);
    const example = exampleOf(op);
    if (example === undefined) continue;
    assert.deepEqual(decoders[op.operationId]!(example), example, op.operationId);
    checked++;
  }
  assert.ok(checked >= 15, `checked ${checked}`);
});

test('decoders tolerate unknown fields, enum values, step and attachment kinds, and junk', () => {
  for (const decode of Object.values(decoders))
    for (const junk of [null, undefined, 1, 'x', [], {}]) decode(junk);
  const m = decoders.getMeetup!({
    extra: 1,
    status: 'teleporting',
    museSteps: [{ stepId: 'st_x', kind: 'summon_dragon', status: 'pondering', label: 'Hmm' }],
    attendees: [{ person: {} }],
  }) as Json;
  assert.equal(m.extra, 1);
  assert.equal(m.museSteps[0].kind, 'summon_dragon');
  assert.deepEqual(m.attendees[0].sharedInterests, []);
  assert.deepEqual(m.approvals, []);
  const msgs = decoders.listMessages!({
    items: [{ attachments: [{ kind: 'poll', q: '?' }] }],
  }) as Json;
  assert.equal(msgs.items[0].attachments[0].kind, 'poll');
  const feed = decoders.getFeed!({ plans: [{ crowd: null }] }) as Json;
  assert.deepEqual(feed.plans[0].crowd.sharedWithYou, []);
  assert.deepEqual(feed.plans[0].checks, []);
  assert.equal(decodeEvent({ type: 'meetup.future', data: null }).type, 'meetup.future');
});

const schemas = spec.components.schemas as Json;
const resolve = (s: Json): Json =>
  s?.$ref
    ? resolve(schemas[s.$ref.split('/').at(-1)])
    : s?.allOf
      ? s.allOf.map(resolve).reduce(
          (a: Json, b: Json) => ({
            required: [...(a.required ?? []), ...(b.required ?? [])],
            properties: { ...a.properties, ...b.properties },
          }),
          {},
        )
      : s;
function assertRequired(value: unknown, schema: Json, label: string) {
  schema = resolve(schema);
  if (!schema || value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertRequired(v, schema.items, `${label}[${i}]`));
    return;
  }
  for (const key of schema.required ?? []) assert.ok(key in value, `${label} missing ${key}`);
  for (const [key, sub] of Object.entries(schema.properties ?? {}))
    if (key in value) assertRequired((value as Json)[key], sub as Json, `${label}.${key}`);
}

test('the mock answers every operation with a body that carries every required key', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  resetMock();
  const u = 'u_maya';
  const call = (method: string, p: string, body?: unknown) => mockRequest(u, method, p, body);
  // Walk the demo so every resource exists: opt in, join the example plan, its meetup forms.
  await call('POST', '/v1/optin', { mode: 'city' });
  await call('POST', '/v1/plans/pl_0001/join', {});
  t.mock.timers.tick(60_000); // the staged group forms and Muse finishes its steps
  const meetup = (await call('GET', '/v1/meetups')) as Json;
  assert.equal(meetup.items.length, 1);
  const ids: Record<string, string> = {
    interestId: 'outdoors.hiking.coastal_hikes',
    provider: 'google_maps',
    signalId: 'si_0001',
    planId: 'pl_0001',
    nudgeId: 'nd_0001',
    meetupId: 'mt_0001',
    approvalId: 'ap_0001',
    userId: 'u_0042',
    threadId: 'th_0001',
  };
  const bodies: Record<string, unknown> = {
    updateMe: { neighborhood: 'Inner Sunset' },
    setInterestVisibility: { visibility: 'shown' },
    optIn: { mode: 'city' },
    completeSetup: {
      acceptedInterestIds: ['outdoors.hiking.coastal_hikes'],
      hiddenInterestIds: [],
      groupSize: { min: 3, max: 5 },
      travel: { maxMinutes: 35, modes: ['transit'] },
      profileVisibility: 'public',
    },
    setSignalVisibility: { visibility: 'hidden' },
    syncCalendar: {
      source: 'device_calendar',
      horizonStart: '',
      horizonEnd: '',
      busy: [],
      applied: [],
    },
    askMuse: { text: 'pottery this weekend' },
    createPlan: { text: 'Pottery with Daniel' },
    setMeetupStatus: { status: 'on_my_way' },
    checkIn: { location: { lat: 37.77, lng: -122.42 } },
    sendFeedback: { answers: [] },
    decideApproval: { decision: 'approve' },
    sendMessage: { text: 'Hi', clientId: 'c_1' },
    report: { userId: 'u_0042', reason: 'other' },
    block: { userId: 'u_0042' },
  };
  // Destructive calls last so earlier ones still find their resources.
  const last = [
    'removeInterest',
    'deleteSignal',
    'disconnectConnector',
    'withdrawJoin',
    'leaveMeetup',
    'dismissNudge',
    'block',
    'optOut',
  ];
  const order = [...ops].sort((a, b) => last.indexOf(a.operationId) - last.indexOf(b.operationId));
  let served = 0;
  for (const op of order) {
    if (op.operationId === 'realtime' || op.operationId === 'joinPlan') continue;
    const p = (op.path as string).replace(/\{(\w+)\}/g, (_, k: string) => ids[k]!);
    const body = await call(op.method, p, bodies[op.operationId] ?? {});
    const [code, res] = success(op)!;
    const schema = res.content?.['application/json']?.schema;
    if (code === '204') assert.equal(body, undefined, op.operationId);
    else assertRequired(body, schema, op.operationId);
    served++;
  }
  assert.equal(served, ops.length - 2);
  await assert.rejects(
    call('GET', '/v1/threads/th_nope'),
    (e: Json) => e.status === 404 && e.error.code === 'not_found',
  );
  resetMock();
});
