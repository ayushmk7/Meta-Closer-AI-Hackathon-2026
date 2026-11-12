import type { FeatureDefinition } from '../../extensions/types';
export const profileFeature: FeatureDefinition = {
  id: 'profile',
  menuItems: [
    {
      id: 'profile',
      label: 'Maya Chen',
      icon: 'person',
      href: '/profile',
      description: 'Your profile',
    },
  ],
};
