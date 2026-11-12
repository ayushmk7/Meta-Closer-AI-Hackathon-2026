import type { FeatureDefinition } from '../../extensions/types';
export const friendsFeature: FeatureDefinition = {
  id: 'friends',
  menuItems: [
    {
      id: 'friends',
      label: 'Friends',
      icon: 'people',
      href: '/friends',
      description: 'Requests and your friends',
    },
  ],
};
