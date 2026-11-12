import type { FeatureDefinition } from '../../extensions/types';
export const settingsFeature: FeatureDefinition = {
  id: 'settings',
  menuItems: [
    {
      id: 'settings',
      label: 'Settings & privacy',
      icon: 'settings',
      href: '/settings',
      description: 'Make Facebook feel like you',
    },
  ],
};
