import type { FeatureDefinition } from './types';
import { feedFeature } from '../features/feed/feature';
import { profileFeature } from '../features/profile/feature';
import { friendsFeature } from '../features/friends/feature';
import { marketplaceFeature } from '../features/marketplace/feature';
import { settingsFeature } from '../features/settings/feature';
import { secondaryFeature } from '../features/secondary/feature';
import { commonGroundFeature } from '../features/common-ground/feature';

export function collectFeatures(features: readonly FeatureDefinition[]) {
  const ids = features.map((feature) => feature.id);
  if (new Set(ids).size !== ids.length) throw new Error('Feature IDs must be unique');
  return {
    menuItems: features.flatMap((feature) => feature.menuItems ?? []),
    homeSections: features.flatMap((feature) => feature.homeSections ?? []),
    composerActions: features.flatMap((feature) => feature.composerActions ?? []),
    postActions: features.flatMap((feature) => feature.postActions ?? []),
    tabs: features.flatMap((feature) => feature.tabs ?? []),
    inboxSources: features.flatMap((feature) => feature.inboxSources ?? []),
    eventSources: features.flatMap((feature) => feature.eventSources ?? []),
    resetHooks: features.flatMap((feature) => feature.resetHooks ?? []),
  };
}
export const features = [
  profileFeature,
  friendsFeature,
  secondaryFeature,
  marketplaceFeature,
  feedFeature,
  settingsFeature,
  commonGroundFeature,
] satisfies FeatureDefinition[];
export const {
  menuItems,
  homeSections,
  composerActions,
  postActions,
  tabs,
  inboxSources,
  eventSources,
  resetHooks,
} = collectFeatures(features);
