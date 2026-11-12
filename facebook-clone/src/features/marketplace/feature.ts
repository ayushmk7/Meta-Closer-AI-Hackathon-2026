import type { FeatureDefinition } from '../../extensions/types';
export const marketplaceFeature: FeatureDefinition = {
  id: 'marketplace',
  menuItems: [
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: 'storefront',
      href: '/marketplace',
      description: 'Find something you love',
    },
  ],
};
