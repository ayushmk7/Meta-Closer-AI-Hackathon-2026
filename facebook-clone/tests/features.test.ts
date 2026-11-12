import assert from 'node:assert/strict';
import test from 'node:test';
import { collectFeatures, features } from '../src/extensions/registry';
import type { FeatureDefinition } from '../src/extensions/types';

test('an additional module contributes its route link, Home surface and action without changing defaults', async () => {
  const FeatureScreen = () => null;
  const Preview = () => null;
  const fixtureRoute = { href: '/test-feature', Screen: FeatureScreen };
  let activated = false;
  let resetRan = false;
  const row = { id: 'row-1', title: 'Row', subtitle: 'Sub', href: fixtureRoute.href };
  const fixture: FeatureDefinition = {
    id: 'test-feature',
    menuItems: [
      { id: 'test-feature', label: 'Test feature', icon: 'sparkles', href: fixtureRoute.href },
    ],
    homeSections: [{ id: 'test-feature-preview', Component: Preview }],
    composerActions: [
      {
        id: 'test-feature-action',
        label: 'Try feature',
        icon: 'sparkles',
        color: '#0866ff',
        run: () => {
          activated = true;
        },
      },
    ],
    tabs: [
      {
        id: 'test-feature-tab',
        label: 'Test',
        href: fixtureRoute.href,
        icon: 'sparkles-outline',
        activeIcon: 'sparkles',
        after: '/friends',
        useBadge: () => 2,
      },
    ],
    inboxSources: [{ id: 'test-inbox', label: 'Test inbox', useRows: () => [row] }],
    eventSources: [{ id: 'test-events', label: 'Test events', useRows: () => [row] }],
    resetHooks: [
      {
        id: 'test-reset',
        run: async () => {
          resetRan = true;
        },
      },
    ],
  };
  const original = collectFeatures(features);
  const extended = collectFeatures([...features, fixture]);
  assert.equal(extended.menuItems.at(-1)?.href, fixtureRoute.href);
  assert.equal(extended.homeSections.at(-1)?.Component, Preview);
  assert.equal(fixtureRoute.Screen(), null);
  extended.composerActions.at(-1)!.run({} as never);
  assert.equal(activated, true);
  assert.equal(extended.tabs.at(-1)?.after, '/friends');
  assert.equal(extended.tabs.at(-1)?.useBadge?.(), 2);
  assert.deepEqual(extended.inboxSources.at(-1)?.useRows(), [row]);
  assert.deepEqual(extended.eventSources.at(-1)?.useRows(), [row]);
  await extended.resetHooks.at(-1)!.run();
  assert.equal(resetRan, true);
  assert.deepEqual(collectFeatures(features), original);
  const core = collectFeatures(features.filter((feature) => feature.id !== 'common-ground'));
  assert.equal(core.homeSections.length, 0);
});

test('duplicate feature IDs fail early', () => {
  assert.throws(() => collectFeatures([{ id: 'duplicate' }, { id: 'duplicate' }]), /unique/);
});
