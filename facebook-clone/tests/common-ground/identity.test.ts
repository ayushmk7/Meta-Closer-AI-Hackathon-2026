import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../../src/features/common-ground/api';
import {
  askMuse,
  getState,
  reset,
  sendMessage,
  setIdentity,
  setStorage,
  start,
} from '../../src/features/common-ground/store';

setStorage({ read: async () => null, write: async () => {}, remove: async () => {} });

// Work started as one person must not land in the next person's state after a switch.
test('actions in flight across setIdentity do not leak into the new identity', async () => {
  await reset();
  await start();
  const real = { ask: api.askMuse, send: api.sendMessage };
  let answer!: () => void;
  api.askMuse = (() =>
    new Promise(
      (r) => (answer = () => r({ conversationId: 'cv_maya', reply: { text: 'hi' } } as never)),
    )) as never;
  let sent!: () => void;
  api.sendMessage = ((threadId: string, text: string, clientId: string) =>
    new Promise(
      (r) => (sent = () => r({ messageId: 'ms_m', threadId, text, clientId } as never)),
    )) as never;
  const asked = askMuse('pottery');
  const sending = sendMessage('th_maya', 'see you there');
  await setIdentity('u_0042');
  answer();
  sent();
  await Promise.all([asked, sending]);
  assert.equal(getState().muse.conversationId, null);
  assert.equal(getState().muse.reply, null);
  assert.equal(getState().messages.th_maya, undefined);
  Object.assign(api, { askMuse: real.ask, sendMessage: real.send });
  await reset();
});
