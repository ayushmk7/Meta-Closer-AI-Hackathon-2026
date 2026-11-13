import assert from 'node:assert/strict';
import test from 'node:test';
import fixtures from '../../src/features/common-ground/fixtures.json';
import { stamps } from '../../src/features/common-ground/stamps';
import {
  credit,
  emptyLog,
  laDay,
  liveStreak,
  quests,
  rollover,
} from '../../src/features/common-ground/questLog';
import type { Meetup, Message } from '../../src/features/common-ground/types';

test('laDay rolls over at LA midnight, not UTC midnight', () => {
  assert.equal(laDay('2026-11-13T07:59:00Z'), '2026-11-12'); // 11:59 PM PST
  assert.equal(laDay('2026-11-13T08:00:00Z'), '2026-11-13'); // midnight PST
  assert.equal(laDay('2026-07-01T06:59:00Z'), '2026-06-30'); // 11:59 PM PDT
});

test('quests derive from today in LA; manual ticks clear on a new day', () => {
  const me = 'u_maya';
  const msg = (createdAt: string) =>
    ({ sender: { kind: 'user', userId: me }, createdAt }) as Message;
  const log = { ...emptyLog('2026-11-12'), talked: true };
  const joins = [{ createdAt: '2026-11-13T07:30:00Z' }]; // Nov 12, 11:30 PM PST
  const messages = { t: [msg('2026-11-12T08:30:00Z')] }; // Nov 12, 12:30 AM PST
  const done = (l = log, day = '2026-11-12') =>
    quests(l, joins, messages, me, day)
      .filter((q) => q.done)
      .map((q) => q.id);
  assert.deepEqual(done(), ['join', 'message', 'talk']);
  const next = rollover(log, '2026-11-13');
  assert.equal(next.talked, false);
  assert.deepEqual(done(next, '2026-11-13'), []);
  assert.deepEqual(quests(log, [], messages, undefined, '2026-11-12')[1].done, false);
});

test('streak: once per day, kept through yesterday, broken by a missed day', () => {
  let log = credit(emptyLog('2026-11-10'), true);
  assert.equal(log.streak, 1);
  assert.equal(credit(log, true), log, 'second quest same day does not double count');
  log = credit(rollover(log, '2026-11-11'), true);
  assert.equal(log.streak, 2);
  log = rollover(log, '2026-11-12');
  assert.equal(liveStreak(log), 2, 'still alive before doing today');
  assert.equal(credit(log, false), log);
  log = rollover(log, '2026-11-13'); // missed all of Nov 12
  assert.equal(liveStreak(log), 0);
  assert.equal(credit(log, true).streak, 1);
  // Across a month boundary.
  assert.equal(
    credit(
      rollover({ ...emptyLog('2026-11-30'), streak: 4, lastDone: '2026-11-30' }, '2026-12-01'),
      true,
    ).streak,
    5,
  );
});

test('passport: stamps only from completed meetups I checked in to or verified', () => {
  const base = fixtures.getMeetup as unknown as Meetup;
  const withMe = (patch: object, status = 'completed') => ({
    ...base,
    status,
    attendees: base.attendees.map((a) => (a.isMe ? { ...a, checkedIn: false, ...patch } : a)),
  });
  const seen = fixtures.getFeed.plans as never;
  const earned = (ms: Meetup[]) =>
    stamps(ms, seen)
      .filter((s) => s.earned)
      .map((s) => s.kind);
  assert.deepEqual(earned([withMe({ checkedIn: true })]), ['activity', 'neighborhood', 'venue']);
  assert.deepEqual(earned([withMe({ verified: true })]).length, 3);
  assert.deepEqual(earned([withMe({})]), [], 'no check-in, no stamp');
  assert.deepEqual(earned([withMe({ checkedIn: true }, 'confirmed')]), [], 'not completed yet');
  const all = stamps([withMe({ checkedIn: true })], seen);
  assert.equal(new Set(all.map((s) => `${s.kind}:${s.key}`)).size, all.length, 'distinct');
  assert.ok(
    all.some((s) => !s.earned && s.label === 'Board game night'),
    'feed shows locked',
  );
  assert.equal(all[0].earned, true, 'earned first');
});
