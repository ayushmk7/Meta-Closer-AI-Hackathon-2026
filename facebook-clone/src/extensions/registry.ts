import type { FeatureDefinition } from './types';
import { feedFeature } from '../features/feed/feature';
import { profileFeature } from '../features/profile/feature';
import { friendsFeature } from '../features/friends/feature';
import { marketplaceFeature } from '../features/marketplace/feature';
import { settingsFeature } from '../features/settings/feature';
import { secondaryFeature } from '../features/secondary/feature';

export function collectFeatures(features: readonly FeatureDefinition[]) {
  const ids = features.map((feature) => feature.id);
  if (new Set(ids).size !== ids.length) throw new Error('Feature IDs must be unique');
  return {
    menuItems: features.flatMap((feature) => feature.menuItems ?? []),
    homeSections: features.flatMap((feature) => feature.homeSections ?? []),
    composerActions: features.flatMap((feature) => feature.composerActions ?? []),
    postActions: features.flatMap((feature) => feature.postActions ?? []),
  };
}
export const features = [
  profileFeature,
  friendsFeature,
  secondaryFeature,
  marketplaceFeature,
  feedFeature,
  settingsFeature,
] satisfies FeatureDefinition[];
export const { menuItems, homeSections, composerActions, postActions } = collectFeatures(features);
