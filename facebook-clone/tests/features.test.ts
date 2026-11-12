import assert from 'node:assert/strict';
import test from 'node:test';
import { collectFeatures, features } from '../src/extensions/registry';
import type { FeatureDefinition } from '../src/extensions/types';

test('an additional module contributes its route link, Home surface and action without changing defaults', () => {
  const FeatureScreen = () => null;
  const Preview = () => null;
  const fixtureRoute = { href: '/test-feature', Screen: FeatureScreen };
  let activated = false;
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
  };
  const original = collectFeatures(features);
  const extended = collectFeatures([...features, fixture]);
  assert.equal(extended.menuItems.at(-1)?.href, fixtureRoute.href);
  assert.equal(extended.homeSections.at(-1)?.Component, Preview);
  assert.equal(fixtureRoute.Screen(), null);
  extended.composerActions.at(-1)!.run({} as never);
  assert.equal(activated, true);
  assert.deepEqual(collectFeatures(features), original);
  assert.equal(original.homeSections.length, 0);
});

test('duplicate feature IDs fail early', () => {
  assert.throws(() => collectFeatures([{ id: 'duplicate' }, { id: 'duplicate' }]), /unique/);
});
