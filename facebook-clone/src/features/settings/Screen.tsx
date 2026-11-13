import React from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import type { Audience, NotificationCategory } from '../../core/types';
import {
  Button,
  Card,
  Divider,
  go,
  Icon,
  Label,
  Muted,
  Page,
  reportError,
  Title,
  useColors,
} from '../../ui/native';
const categories: { id: NotificationCategory; label: string; detail: string }[] = [
  {
    id: 'friends',
    label: 'Friend activity',
    detail: 'Friend requests and updates from people you know',
  },
  { id: 'posts', label: 'Post activity', detail: 'Reactions and comments on your posts' },
  { id: 'marketplace', label: 'Marketplace', detail: 'Saved listings and seller updates' },
  { id: 'messages', label: 'Messages', detail: 'Updates from local conversations' },
];
export default function SettingsScreen() {
  const demo = useDemo();
  const c = useColors();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const settings = demo.state.settings;
  const reset = () =>
    Alert.alert(
      'Reset this demo?',
      'Your posts, photos, comments, messages and settings on this device will be removed. The original fictional feed will return.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset demo',
          style: 'destructive',
          onPress: () => {
            void demo.actions
              .reset()
              .then(() => router.replace('/'))
              .catch(reportError);
          },
        },
      ],
    );
  const rows = [
    {
      id: 'display',
      icon: 'moon-outline' as const,
      title: 'Display & accessibility',
      value: settings.theme === 'light' ? 'Light' : 'Dark',
    },
    {
      id: 'notifications',
      icon: 'notifications-outline' as const,
      title: 'Notifications',
      value: `${Object.values(settings.notifications).filter(Boolean).length} categories on`,
    },
    {
      id: 'feed',
      icon: 'newspaper-outline' as const,
      title: 'Feed preferences',
      value: settings.feedOrder === 'curated' ? 'Curated order' : 'Most recent',
    },
    {
      id: 'audience',
      icon: 'people-outline' as const,
      title: 'Audience and visibility',
      value: settings.audience,
    },
  ];
  const selected = rows.find((row) => row.id === section);
  const valid = !section || rows.some((row) => row.id === section) || section === 'reset';
  return (
    <Page>
      <Card style={{ borderRadius: 0 }}>
        <Title>{selected?.title ?? 'Settings & privacy'}</Title>
        {!section && (
          <>
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <Label style={{ fontSize: 19, fontWeight: '700' }}>Preferences</Label>
              <Muted>Customize your experience on Facebook.</Muted>
            </View>
            {rows.map((row, index) => (
              <React.Fragment key={row.id}>
                {index === 3 && (
                  <View style={{ padding: 16, paddingTop: 28 }}>
                    <Label style={{ fontSize: 19, fontWeight: '700' }}>
                      Audience and visibility
                    </Label>
                    <Muted>Control who can see what you share.</Muted>
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${row.title}, ${row.value}`}
                  onPress={() => go(`/settings/${row.id}`)}
                  style={{
                    minHeight: 74,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <Icon name={row.icon} size={25} />
                  <View style={{ flex: 1 }}>
                    <Label style={{ fontWeight: '600' }}>{row.title}</Label>
                    <Muted>{row.value}</Muted>
                  </View>
                  <Icon name="chevron-forward" color={c.secondary} size={19} />
                </Pressable>
              </React.Fragment>
            ))}
            <Divider />
            <View style={{ padding: 16, gap: 14 }}>
              <Button
                title="Privacy Checkup"
                secondary
                icon="shield-checkmark-outline"
                onPress={() => go('/privacy')}
              />
              <Button title="Reset demo" secondary icon="refresh" onPress={reset} />
              <Muted>Unofficial hackathon demo. All changes stay on this device.</Muted>
            </View>
          </>
        )}
        {section === 'display' && (
          <View style={{ padding: 16, gap: 16 }}>
            <Muted>Choose the appearance for every screen, menu and conversation.</Muted>
            {(['light', 'dark'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: settings.theme === value }}
                onPress={() => demo.actions.updateSettings({ theme: value })}
                style={{
                  minHeight: 76,
                  borderWidth: 1,
                  borderColor: settings.theme === value ? c.blue : c.divider,
                  borderRadius: 10,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <Icon name={value === 'light' ? 'sunny-outline' : 'moon-outline'} />
                <Label style={{ fontSize: 17, flex: 1 }}>
                  {value === 'light' ? 'Light' : 'Dark'}
                </Label>
                <Icon
                  name={settings.theme === value ? 'radio-button-on' : 'radio-button-off'}
                  color={settings.theme === value ? c.blue : c.secondary}
                />
              </Pressable>
            ))}
            <Muted>System text size and reduced-motion settings are respected.</Muted>
          </View>
        )}
        {section === 'notifications' && (
          <View style={{ padding: 16, gap: 14 }}>
            <Muted>Choose which categories appear in your notifications and unread badge.</Muted>
            {categories.map((category) => (
              <View
                key={category.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Label style={{ fontWeight: '600' }}>{category.label}</Label>
                  <Muted>{category.detail}</Muted>
                  <Muted>{settings.notifications[category.id] ? 'On' : 'Off'}</Muted>
                </View>
                <Switch
                  accessibilityLabel={category.label}
                  value={settings.notifications[category.id]}
                  onValueChange={(value) =>
                    demo.actions.updateSettings({
                      notifications: { ...settings.notifications, [category.id]: value },
                    })
                  }
                  trackColor={{ true: c.blue, false: c.secondary }}
                  ios_backgroundColor={c.secondary} // iOS ignores trackColor.false
                />
              </View>
            ))}
          </View>
        )}
        {section === 'feed' && (
          <View style={{ padding: 16, gap: 14 }}>
            <Muted>Choose how posts appear in Home and Feeds.</Muted>
            {(
              [
                {
                  id: 'curated',
                  label: 'Curated order',
                  detail: 'The original, fixed story of your community',
                },
                {
                  id: 'recent',
                  label: 'Most recent',
                  detail: 'Posts sorted by their saved timestamps',
                },
              ] as const
            ).map((item) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: settings.feedOrder === item.id }}
                key={item.id}
                onPress={() => demo.actions.updateSettings({ feedOrder: item.id })}
                style={{
                  padding: 16,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: settings.feedOrder === item.id ? c.blue : c.divider,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Label style={{ fontWeight: '700' }}>{item.label}</Label>
                  <Muted>{item.detail}</Muted>
                </View>
                <Icon
                  name={settings.feedOrder === item.id ? 'radio-button-on' : 'radio-button-off'}
                  color={c.blue}
                />
              </Pressable>
            ))}
            <Button title="See your feed" secondary onPress={() => go('/feeds')} />
          </View>
        )}
        {section === 'audience' && (
          <View style={{ padding: 16, gap: 14 }}>
            <Label style={{ fontWeight: '700', fontSize: 19 }}>
              Who can see your future posts?
            </Label>
            <Muted>
              This is the default for new posts. You can choose a different audience in the
              composer.
            </Muted>
            {(['Public', 'Friends', 'Only me'] as Audience[]).map((audience) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: settings.audience === audience }}
                key={audience}
                onPress={() => demo.actions.updateSettings({ audience })}
                style={{ paddingVertical: 18, flexDirection: 'row', gap: 14, alignItems: 'center' }}
              >
                <Icon
                  name={
                    audience === 'Public'
                      ? 'earth-outline'
                      : audience === 'Friends'
                        ? 'people-outline'
                        : 'lock-closed-outline'
                  }
                />
                <View style={{ flex: 1 }}>
                  <Label style={{ fontWeight: '700' }}>{audience}</Label>
                  <Muted>
                    {audience === 'Public'
                      ? 'Anyone in the demo public preview'
                      : audience === 'Friends'
                        ? 'Your confirmed demo friends'
                        : 'Visible only to your demo account'}
                  </Muted>
                </View>
                <Icon
                  name={settings.audience === audience ? 'radio-button-on' : 'radio-button-off'}
                  color={settings.audience === audience ? c.blue : c.secondary}
                />
              </Pressable>
            ))}
          </View>
        )}
        {section === 'reset' && (
          <View style={{ padding: 16, gap: 16 }}>
            <Label>Restore the original fictional feed, photos and settings on this device.</Label>
            <Button title="Reset demo" onPress={reset} />
          </View>
        )}
        {!valid && (
          <View style={{ padding: 16, gap: 16 }}>
            <Label>This settings section is not available.</Label>
            <Button title="All settings" secondary onPress={() => router.replace('/settings')} />
          </View>
        )}
      </Card>
    </Page>
  );
}
