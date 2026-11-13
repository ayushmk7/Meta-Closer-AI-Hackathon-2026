import React, { type ComponentProps, type ReactNode } from 'react';
import { Image, Pressable, View, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useDemo } from '../core/store';
import { imageSource } from '../data/media';
import { tabs as contributedTabs } from '../extensions/registry';
import { Avatar, Busy, go, Icon, IconButton, Label, useColors } from './native';

const coreTabs = [
  { href: '/', name: 'Home', icon: 'home-outline', active: 'home' },
  { href: '/friends', name: 'Friends', icon: 'people-outline', active: 'people' },
  { href: '/marketplace', name: 'Marketplace', icon: 'storefront-outline', active: 'storefront' },
  {
    href: '/notifications',
    name: 'Notifications',
    icon: 'notifications-outline',
    active: 'notifications',
  },
  { href: '/menu', name: 'Menu', icon: 'menu-outline', active: 'menu' },
] as const;
type ShellTab = {
  href: string;
  name: string;
  icon: string;
  active: string;
  useBadge?: () => number;
};
const tabs = coreTabs.reduce<ShellTab[]>((list, tab) => {
  list.push(tab);
  for (const extra of contributedTabs.filter((item) => item.after === tab.href))
    list.push({
      href: extra.href,
      name: extra.label,
      icon: extra.icon,
      active: extra.activeIcon,
      useBadge: extra.useBadge,
    });
  return list;
}, []);

// Logged-out Welcome gets no tab chrome, so no authenticated badge hooks run there.
// A separate component keeps hook order stable when navigating in or out.
export default function Shell({ children }: { children: ReactNode }) {
  const c = useColors();
  if (usePathname() !== '/common-ground/welcome') return <TabShell>{children}</TabShell>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.card }}>{children}</SafeAreaView>;
}

function TabShell({ children }: { children: ReactNode }) {
  const demo = useDemo();
  const c = useColors();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const topLevel = tabs.some((tab) => tab.href === path);
  const ownTab = contributedTabs.find((tab) => tab.href === path);
  const action = ownTab?.headerAction;
  // Badge hooks run every render, in registry order, before any early return.
  const badges = tabs.map((tab) => tab.useBadge?.() ?? 0);
  if (!demo.ready) return <Busy />;
  const person = demo.person(demo.seed.viewerId);
  const titles: Record<string, string> = {
    profile: 'Profile',
    settings: 'Settings & privacy',
    messages: 'Messenger',
    search: 'Search',
    posts: 'Post',
    stories: 'Stories',
    marketplace: 'Marketplace',
    video: 'Video',
    groups: 'Groups',
    memories: 'Memories',
    saved: 'Saved',
    feeds: 'Feeds',
    events: 'Events',
    privacy: 'Privacy Checkup',
  };
  const title =
    contributedTabs.find((tab) => path.startsWith(`${tab.href}/`))?.label ??
    titles[path.split('/')[1]] ??
    'Facebook';
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.card }}>
      <StatusBar style={demo.state.settings.theme === 'dark' ? 'light' : 'dark'} />
      <View
        style={{
          height: 52,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.divider,
          gap: 4,
        }}
      >
        {topLevel ? (
          <Pressable
            onPress={() => router.replace('/')}
            accessibilityRole="button"
            accessibilityLabel="Facebook Home"
            style={{ flex: ownTab ? undefined : 1, minHeight: 44, justifyContent: 'center' }}
          >
            <Image
              source={imageSource('facebook-logo')}
              style={{ width: 40, height: 40 }}
              accessibilityLabel="Facebook"
            />
          </Pressable>
        ) : (
          <>
            <IconButton
              name="arrow-back"
              label="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
            <Label numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', flex: 1 }}>
              {title}
            </Label>
          </>
        )}
        {ownTab && (
          <Label
            accessibilityRole="header"
            numberOfLines={1}
            style={{ fontSize: 24, lineHeight: 30, fontWeight: '800', flex: 1, marginLeft: 4 }}
          >
            {ownTab.label}
          </Label>
        )}
        {action && (
          <IconButton
            name={action.icon as ComponentProps<typeof Icon>['name']}
            label={action.label}
            onPress={() => go(action.href)}
          />
        )}
        {path !== '/search' && (
          <IconButton name="search" label="Search Facebook" onPress={() => go('/search')} />
        )}
        {!path.startsWith('/messages') && (
          <IconButton
            name="chatbubble-ellipses"
            label="Open Messenger"
            onPress={() => go('/messages')}
          />
        )}
        {path === '/menu' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            onPress={() => go('/profile')}
            style={{ padding: 5 }}
          >
            <Avatar image={person.avatar} size={32} />
          </Pressable>
        )}
      </View>
      {!!demo.error && (
        <View
          accessibilityRole="alert"
          style={{
            backgroundColor: '#fff2d2',
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Label style={{ color: '#634100', flex: 1, fontSize: 13 }}>{demo.error}</Label>
          <IconButton
            name="close"
            label="Dismiss save error"
            onPress={demo.clearError}
            color="#634100"
          />
        </View>
      )}
      <View
        style={{ flex: 1, backgroundColor: c.canvas, paddingBottom: topLevel ? 0 : insets.bottom }}
      >
        {children}
      </View>
      {topLevel && (
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: c.card,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.divider,
            paddingBottom: Math.max(insets.bottom, 6),
            paddingTop: 4,
          }}
        >
          {tabs.map((tab, index) => {
            const active = path === tab.href;
            const badge = tab.href === '/notifications' ? demo.unreadCount : badges[index];
            return (
              <Pressable
                key={tab.href}
                onPress={() => router.navigate(tab.href as Href)}
                accessibilityRole="tab"
                accessibilityLabel={tab.name}
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  minHeight: 50,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                }}
              >
                <View>
                  <Icon
                    name={(active ? tab.active : tab.icon) as ComponentProps<typeof Icon>['name']}
                    size={26}
                    color={active ? c.blue : c.secondary}
                  />
                  {badge > 0 && (
                    <View
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -9,
                        borderRadius: 10,
                        backgroundColor: c.badge,
                        paddingHorizontal: 5,
                      }}
                    >
                      <Label
                        style={{ color: '#fff', fontSize: 10, lineHeight: 16, fontWeight: '700' }}
                      >
                        {badge}
                      </Label>
                    </View>
                  )}
                </View>
                <Label
                  numberOfLines={1}
                  style={{
                    color: active ? c.blue : c.secondary,
                    fontSize: 9,
                    lineHeight: 13,
                    fontWeight: active ? '700' : '500',
                  }}
                >
                  {tab.name}
                </Label>
              </Pressable>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}
