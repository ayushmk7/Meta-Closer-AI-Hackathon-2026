import type { FeatureDefinition } from '../../extensions/types';
export const secondaryFeature: FeatureDefinition = {
  id: 'secondary',
  menuItems: [
    {
      id: 'memories',
      label: 'Memories',
      icon: 'time',
      href: '/memories',
      description: 'A little look back',
    },
    {
      id: 'saved',
      label: 'Saved',
      icon: 'bookmark',
      href: '/saved',
      description: 'Your saved posts',
    },
    {
      id: 'groups',
      label: 'Groups',
      icon: 'people-circle',
      href: '/groups',
      description: 'Your communities',
    },
    {
      id: 'video',
      label: 'Video',
      icon: 'play-circle',
      href: '/video',
      description: 'Discover local highlights',
    },
    {
      id: 'feeds',
      label: 'Feeds',
      icon: 'albums',
      href: '/feeds',
      description: 'All your friends in one place',
    },
    {
      id: 'events',
      label: 'Events',
      icon: 'calendar',
      href: '/events',
      description: 'Make plans together',
    },
  ],
};
