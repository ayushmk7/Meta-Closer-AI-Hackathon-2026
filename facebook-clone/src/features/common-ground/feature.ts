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
      label: 'Meetups',
      href: '/common-ground',
      icon: 'sparkles-outline',
      activeIcon: 'sparkles',
      after: '/friends',
      useBadge,
      headerAction: {
        icon: 'settings-outline',
        label: 'Meetups settings',
        href: '/common-ground/settings',
      },
      // The shell bar names these pushed screens (same names as the web back row).
      titles: {
        settings: 'Settings',
        person: 'Profile',
        passport: 'Your passport',
        scan: 'Verify in person',
        explore: 'Explore',
        demo: 'Demo',
      },
    },
  ],
  menuItems: [
    {
      id: 'common-ground',
      label: 'Meetups',
      icon: 'sparkles-outline',
      href: '/common-ground',
      description: "Meet up with people who are into what you're into",
    },
  ],
  homeSections: [{ id: 'common-ground-home', Component: HomeSection }],
  inboxSources: [{ id: 'common-ground', label: 'Meetups', useRows: useInboxRows }],
  eventSources: [{ id: 'common-ground', label: 'Planned with Muse', useRows: useEventRows }],
  resetHooks: [{ id: 'common-ground', run: reset }],
};
