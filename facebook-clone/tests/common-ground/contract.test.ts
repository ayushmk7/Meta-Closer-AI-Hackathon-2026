import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { decoders } from '../../src/features/common-ground/types';
import { mockRequest, resetMock } from '../../src/features/common-ground/mock';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- walking raw JSON
const spec: Json = JSON.parse(
  readFileSync(path.resolve('../common-ground-prds/contracts/openapi.json'), 'utf8'),
);
const ops = Object.values(spec.paths as Json).flatMap((methods: Json) =>
  Object.values(methods),
) as Json[];
const success = (op: Json) =>
  Object.entries(op.responses ?? {}).find(([code]) => code.startsWith('2'))?.[1] as
    Json | undefined;

test('every openapi 2xx example decodes unchanged', () => {
  let checked = 0;
  for (const op of ops) {
    const example = success(op)?.content?.['application/json']?.example;
    if (!example || !decoders[op.operationId]) continue;
    assert.deepEqual(decoders[op.operationId](example), example, op.operationId);
    checked++;
  }
  assert.ok(checked >= 12, `checked ${checked}`);
});

test('decoders tolerate unknown fields, enum values, attachment kinds and junk', () => {
  for (const decode of Object.values(decoders))
    for (const junk of [null, undefined, 1, 'x', [], {}]) decode(junk);
  const drop = decoders.getCurrentDrop({
    extra: 1,
    cards: [{ state: 'snoozed', distanceBand: 'moon', future: true }],
  }) as Json;
  assert.equal(drop.extra, 1);
  assert.deepEqual(drop.cards[0].sharedInterests, []);
  assert.equal(drop.cards[0].state, 'snoozed');
  const msgs = decoders.listMessages({
    items: [{ attachments: [{ kind: 'poll', question: '?' }] }],
  }) as Json;
  assert.equal(msgs.items[0].attachments[0].kind, 'poll');
  const map = decoders.getMap({}) as Json;
  assert.deepEqual([map.friends, map.tray, map.meetups], [[], [], []]);
});

const schemas = spec.components.schemas as Json;
const schemaOf = (ref: string) => schemas[ref.split('/').at(-1)!] as Json;
function assertRequired(value: Json, schema: Json, label: string) {
  if (schema.$ref) schema = schemaOf(schema.$ref);
  for (const key of schema.required ?? []) assert.ok(key in value, `${label} missing ${key}`);
  const itemSchema = schema.properties?.items?.items;
  if (itemSchema) for (const item of value.items) assertRequired(item, itemSchema, `${label}[]`);
}

test('mock responses for the main GETs carry every required key', async () => {
  resetMock();
  const u = 'u_maya';
  await mockRequest(u, 'POST', '/v1/optin', { mode: 'city' });
  await mockRequest(u, 'POST', '/v1/suggestions/sg_0001/decision', { decision: 'connect' });
  const meetup = (await mockRequest(u, 'POST', '/v1/threads/th_0001/plan', {})) as Json;
  const byId = Object.fromEntries(ops.map((op) => [op.operationId, op]));
  const gets: [string, string][] = [
    ['getConfig', '/v1/config'],
    ['getMe', '/v1/me'],
    ['getDensity', '/v1/pools/pool_sf_city/density'],
    ['getCurrentDrop', '/v1/drops/current'],
    ['listHi', '/v1/hi'],
    ['listInvites', '/v1/invites'],
    ['listConnections', '/v1/connections'],
    ['listThreads', '/v1/threads'],
    ['getThread', '/v1/threads/th_0001'],
    ['listMessages', '/v1/threads/th_0001/messages'],
    ['listMeetups', '/v1/meetups'],
    ['getMeetup', `/v1/meetups/${meetup.meetupId}`],
    ['getMap', '/v1/map'],
    ['getPerson', '/v1/people/u_0042'],
  ];
  for (const [operationId, p] of gets) {
    const body = (await mockRequest(u, 'GET', p)) as Json;
    assertRequired(
      body,
      success(byId[operationId])!.content['application/json'].schema,
      operationId,
    );
  }
  await assert.rejects(
    mockRequest(u, 'GET', '/v1/threads/th_nope'),
    (e: Json) => e.status === 404 && e.error.code === 'not_found',
  );
  resetMock();
});
