import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../../src/features/common-ground/api';
import {
  decideApproval,
  getState,
  load,
  mergeStep,
  setState,
} from '../../src/features/common-ground/store';
import type { Meetup, MuseStep } from '../../src/features/common-ground/types';

const step = (stepId: string, status = 'queued'): MuseStep => ({
  stepId,
  kind: 'book',
  status,
  label: stepId,
  at: '2026-11-12T18:00:00Z',
});
const mt = (museSteps: MuseStep[]) => ({ meetupId: 'mt_r', museSteps }) as unknown as Meetup;

// CONTRACTS §3 rule 10: steps are never dropped. A fetch that left before a step event (or before
// a newer fetch) must not overwrite what landed after it.
test('a stale meetup fetch never drops a newer step or overwrites a newer fetch', async () => {
  const real = { list: api.listMeetups, get: api.getMeetup };
  setState({ meetups: { mt_r: mt([step('a')]) } });

  let releaseList!: () => void;
  api.listMeetups = () => new Promise((r) => (releaseList = () => r([mt([step('a')])])));
  const list = load.meetups();
  mergeStep('mt_r', step('b'));
  releaseList();
  await list;
  assert.deepEqual(
    getState().meetups.mt_r!.museSteps.map((s) => s.stepId),
    ['a', 'b'],
  );

  const pending: (() => void)[] = [];
  api.getMeetup = (() =>
    new Promise((r) =>
      pending.push(() => r(mt([step('a'), step('b'), step('c', String(pending.length))]))),
    )) as never;
  const older = load.meetup('mt_r');
  const newer = load.meetup('mt_r');
  pending[1]!();
  await newer;
  pending[0]!();
  await older;
  assert.equal(getState().meetups.mt_r!.museSteps[2]!.status, '2');

  // A decided approval must not flip back to pending when an older fetch lands (C8 sheet re-opens).
  const ap = (status: string) => ({ approvalId: 'ap_r', meetupId: 'mt_r', status });
  setState({ meetups: { mt_r: { ...mt([]), approvals: [ap('pending')] } as never } });
  let releaseOld!: () => void;
  api.getMeetup = (() =>
    new Promise((r) => (releaseOld = () => r({ ...mt([]), approvals: [ap('pending')] })))) as never;
  const stale = load.meetup('mt_r');
  const realDecide = api.decideApproval;
  api.decideApproval = (async () => ap('approved')) as never;
  api.getMeetup = (() => new Promise(() => {})) as never; // the refetch after deciding stays out
  await decideApproval('ap_r', 'approve');
  releaseOld();
  await stale;
  assert.equal(getState().meetups.mt_r!.approvals[0]!.status, 'approved');
  api.decideApproval = realDecide;

  Object.assign(api, { listMeetups: real.list, getMeetup: real.get });
  setState({ meetups: {} });
});
