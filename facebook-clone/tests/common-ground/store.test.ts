import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../../src/features/common-ground/api';
import {
  act,
  badgeCount,
  decide,
  eventRows,
  getState,
  inboxRows,
  load,
  refreshAll,
  reset,
  sendLocation,
  sendMessage,
  setState,
  setStorage,
  start,
} from '../../src/features/common-ground/store';

let saved: string | null = null;
setStorage({
  read: async () => saved,
  write: async (v) => void (saved = v),
  remove: async () => void (saved = null),
});

test('Common Ground store runs the scripted demo on the in-app mock', async (t) => {
  await reset();
  await start();
  let s = getState();
  assert.equal(s.ready, true);
  assert.equal(s.me?.optedIn, false);

  await t.test('shell hooks give 0 and [] when not opted in', () => {
    setState({
      threads: [
        {
          threadId: 'th_x',
          kind: 'direct',
          title: 'X',
          participants: [],
          unreadCount: 2,
          updatedAt: '',
        },
      ],
    });
    assert.equal(badgeCount(getState()), 0);
    assert.deepEqual(inboxRows(getState().threads, false), []);
    assert.deepEqual(eventRows(getState().meetups, false), []);
    setState({ threads: [] });
  });

  await t.test('only own prefs are persisted', () => {
    setState({ homeCardDismissed: true });
    assert.deepEqual(Object.keys(JSON.parse(saved!)).sort(), [
      'drafts',
      'homeCardDismissed',
      'lastMode',
      'userOverride',
    ]);
  });

  await act(() => api.optIn('city'));
  await load.me();
  await refreshAll();
  assert.equal(getState().me?.optedIn, true);
  assert.ok(badgeCount(getState()) > 0);

  await t.test('decide: connect_sent, passed, connected with celebrate', async () => {
    await decide('sg_0003', 'connect');
    await decide('sg_0004', 'pass');
    await decide('sg_0001', 'connect');
    const cards = Object.fromEntries(getState().drop!.cards.map((c) => [c.suggestionId, c.state]));
    assert.deepEqual(
      [cards.sg_0003, cards.sg_0004, cards.sg_0001],
      ['connect_sent', 'passed', 'connected'],
    );
    s = getState();
    assert.equal(s.celebrate?.connectionId, 'cn_0001');
    assert.equal(inboxRows(s.threads, true)[0].href, '/common-ground/chat/th_0001');
  });

  await t.test('optimistic send reconciles by clientId; failure restores the draft', async () => {
    const sending = sendMessage('th_0001', 'Hello Daniel');
    const pending = getState().messages.th_0001.at(-1)!;
    assert.ok(pending.messageId.startsWith('pending:'));
    await sending;
    const last = getState().messages.th_0001.at(-1)!;
    assert.equal(last.clientId, pending.clientId);
    assert.ok(!last.messageId.startsWith('pending:'));
    await load.messages('th_0001');
    assert.equal(
      getState().messages.th_0001.filter((m) => m.clientId === pending.clientId).length,
      1,
    );

    const real = api.sendMessage;
    api.sendMessage = async () => {
      throw new Error('offline');
    };
    const before = getState().messages.th_0001.length;
    await sendMessage('th_0001', 'Lost?');
    api.sendMessage = real;
    assert.equal(getState().messages.th_0001.length, before);
    assert.equal(getState().drafts.th_0001, 'Lost?');
    assert.equal(getState().error?.message, 'offline');
    setState({ error: null });
  });

  await t.test('C2: sendLocation throttles and sends the fake location', async () => {
    const sent: unknown[] = [];
    const real = api.updateLocation;
    api.updateLocation = async (l) => void sent.push(l);
    await sendLocation();
    await sendLocation();
    api.updateLocation = real;
    assert.deepEqual(sent, [getState().config!.demo.fakeLocation]);
  });

  await reset();
  assert.equal(getState().ready, false);
  assert.equal(saved, null);
});
