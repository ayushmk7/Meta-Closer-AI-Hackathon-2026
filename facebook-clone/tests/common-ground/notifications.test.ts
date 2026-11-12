import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileReminders, setNotifier } from '../../src/features/common-ground/notifications';
import { getState, setState, setStorage } from '../../src/features/common-ground/store';
import type { Meetup } from '../../src/features/common-ground/types';

setStorage({ read: async () => null, write: async () => {}, remove: async () => {} });

test('leave-by: scheduled on confirm, moved on reschedule, cancelled on leave', async () => {
  const ops: string[] = [];
  let n = 0;
  setNotifier({
    permission: async () => true,
    schedule: async (at, _t, body) => (ops.push(`at:${at.toISOString()}:${body}`), `n${++n}`),
    cancel: async (id) => void ops.push(`cancel:${id}`),
  });
  const leaveBy = new Date(Date.now() + 3_600_000).toISOString();
  const meetup = (patch: Partial<Meetup> = {}, rsvp = 'going') =>
    ({
      meetupId: 'mt_1',
      title: 'Wheel-throwing drop-in',
      status: 'confirmed',
      venue: { name: 'Hayes Clay Studio' },
      attendees: [{ isMe: true, rsvp }],
      travel: { leaveBy, label: '22 min by transit' },
      ...patch,
    }) as unknown as Meetup;
  setState({ me: { museSettings: { leaveByReminders: true } } as never, reminders: {} });

  setState({ meetups: { mt_1: meetup({ status: 'setting_up' }) } });
  await reconcileReminders();
  assert.deepEqual(ops, [], 'nothing before confirmed');

  setState({ meetups: { mt_1: meetup() } });
  await reconcileReminders();
  await reconcileReminders(); // idempotent
  assert.equal(ops.length, 1);
  assert.match(ops[0]!, /Leave by .* for Hayes Clay Studio · 22 min by transit$/);

  const later = new Date(Date.parse(leaveBy) + 3_600_000).toISOString();
  setState({ meetups: { mt_1: meetup({ travel: { leaveBy: later, label: 'x' } as never }) } });
  await reconcileReminders();
  assert.equal(ops[1], 'cancel:n1');
  assert.ok(ops[2]!.startsWith(`at:${later}`));

  setState({
    meetups: { mt_1: meetup({ travel: { leaveBy: later, label: 'x' } as never }, 'left') },
  });
  await reconcileReminders();
  assert.equal(ops[3], 'cancel:n2');
  assert.deepEqual(getState().reminders, {});
});

test('a failed schedule does not lose the ones already scheduled (no duplicates)', async () => {
  const scheduled: string[] = [];
  let failB = true;
  setNotifier({
    permission: async () => true,
    schedule: async (_at, _t, _b, meetupId) => {
      if (meetupId === 'mt_b' && failB) throw new Error('nope');
      scheduled.push(meetupId);
      return `n_${meetupId}`;
    },
    cancel: async () => {},
  });
  const leaveBy = new Date(Date.now() + 3_600_000).toISOString();
  const m = (meetupId: string) =>
    ({
      meetupId,
      title: 'x',
      status: 'confirmed',
      venue: { name: 'v' },
      attendees: [{ isMe: true, rsvp: 'going' }],
      travel: { leaveBy, label: 'l' },
    }) as unknown as Meetup;
  setState({
    me: { museSettings: { leaveByReminders: true } } as never,
    reminders: {},
    meetups: { mt_a: m('mt_a'), mt_b: m('mt_b') },
  });
  await reconcileReminders();
  failB = false;
  await reconcileReminders();
  assert.deepEqual(scheduled, ['mt_a', 'mt_b']);
});
