import assert from 'node:assert/strict';
import test from 'node:test';
import { collectFeatures, features } from '../../src/extensions/registry';
import { commonGroundFeature } from '../../src/features/common-ground/feature';

test('Common Ground contributes exactly one of each extension point, registered last', () => {
  const c = collectFeatures([commonGroundFeature]);
  for (const key of [
    'tabs',
    'menuItems',
    'homeSections',
    'inboxSources',
    'eventSources',
    'resetHooks',
  ] as const)
    assert.equal(c[key].length, 1, key);
  assert.equal(c.composerActions.length + c.postActions.length, 0);
  assert.equal(features.at(-1), commonGroundFeature);
  assert.deepEqual(
    { ...c.tabs[0], useBadge: undefined },
    {
      id: 'common-ground',
      label: 'Plans',
      href: '/common-ground',
      icon: 'sparkles-outline',
      activeIcon: 'sparkles',
      after: '/friends',
      useBadge: undefined,
      headerAction: {
        icon: 'settings-outline',
        label: 'Plans settings',
        href: '/common-ground/settings',
      },
    },
  );
  assert.equal(c.menuItems[0].icon, 'sparkles-outline');
  assert.equal(c.inboxSources[0].label, 'Plans');
  assert.equal(c.menuItems[0].label, 'Plans'); // one user-facing name
  assert.equal(c.eventSources[0].label, 'Planned with Muse');
});
