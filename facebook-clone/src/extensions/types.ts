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
}
