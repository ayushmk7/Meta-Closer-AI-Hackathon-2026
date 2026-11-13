import type { ComponentType } from 'react';
import type { DemoContextValue, Post } from '../core/types';
export interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  description?: string;
}
export interface SurfaceContext {
  demo: DemoContextValue;
  navigate(href: string): void;
  notify(message: string): void;
}
export interface ComposerContext extends SurfaceContext {
  selectPhoto(): void;
  openComposer(): void;
  chooseFeeling(): void;
}
export interface ComposerAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  run(context: ComposerContext): void;
}
export interface PostAction {
  id: string;
  label(context: SurfaceContext, post: Post): string;
  icon: string;
  run(context: SurfaceContext, post: Post): void;
}
export interface HomeSection {
  id: string;
  Component: ComponentType;
}
export interface FeatureDefinition {
  id: string;
  menuItems?: NavigationItem[];
  homeSections?: HomeSection[];
  composerActions?: ComposerAction[];
  postActions?: PostAction[];
  tabs?: TabItem[]; // at most one per feature; native bottom bar only
  inboxSources?: InboxSource[]; // rows merged into the Messenger chat list (native)
  eventSources?: EventSource[]; // rows merged into the Events screen (native)
  resetHooks?: ResetHook[]; // run by Settings > Reset demo, after the core reset
}
export interface TabItem {
  id: string;
  label: string; // short: one word
  href: string; // e.g. '/common-ground'
  icon: string; // Ionicons name, inactive
  activeIcon: string; // Ionicons name, active
  after: '/' | '/friends' | '/marketplace' | '/notifications'; // position in the bar
  useBadge?: () => number; // hook; 0 hides the badge
  headerAction?: { icon: string; label: string; href: string }; // top-bar button shown beside search while this tab is open
}
export interface ExternalRow {
  id: string;
  title: string;
  subtitle: string;
  time?: string; // already formatted for display
  imageUri?: string | null; // remote or local URI; null shows initials
  initials?: string;
  unread?: boolean;
  href: string; // in-app route
}
export interface InboxSource {
  id: string;
  label: string;
  useRows(): ExternalRow[];
}
export interface EventSource {
  id: string;
  label: string;
  useRows(): ExternalRow[];
}
export interface ResetHook {
  id: string;
  run(): Promise<void>;
}
