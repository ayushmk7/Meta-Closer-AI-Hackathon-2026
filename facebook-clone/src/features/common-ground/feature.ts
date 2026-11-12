// Imported by the registry, which core/store and the Shell load: keep this graph free of
// react-native, expo-*, ui/* and platform/* at module top level.
import { createElement } from 'react';
import type { FeatureDefinition } from '../../extensions/types';
import { reset, useBadge, useEventRows, useInboxRows } from './store';

function HomeSection() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- HomeCard imports React Native; load it at render only.
  return createElement(require('./HomeCard').default);
}

export const commonGroundFeature: FeatureDefinition = {
  id: 'common-ground',
  tabs: [
    {
      id: 'common-ground',
      label: 'Map',
      href: '/common-ground',
      icon: 'map-outline',
      activeIcon: 'map',
      after: '/friends',
      useBadge,
    },
  ],
  menuItems: [
    {
      id: 'common-ground',
      label: 'Common Ground',
      icon: 'people-circle-outline',
      href: '/common-ground',
      description: 'Meet people who share your interests',
    },
  ],
  homeSections: [{ id: 'common-ground-home', Component: HomeSection }],
  inboxSources: [{ id: 'common-ground', label: 'Common Ground', useRows: useInboxRows }],
  eventSources: [{ id: 'common-ground', label: 'Planned with Muse', useRows: useEventRows }],
  resetHooks: [{ id: 'common-ground', run: reset }],
};
