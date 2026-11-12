import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useDemo } from '../../core/store';
import { menuItems } from '../../extensions/registry';
import {
  Avatar,
  Button,
  Card,
  Divider,
  go,
  Icon,
  IconButton,
  Label,
  Muted,
  Page,
  Title,
  useColors,
} from '../../ui/native';
const order = ['memories', 'saved', 'groups', 'video', 'marketplace', 'friends', 'feeds', 'events'];
export default function MenuScreen() {
  const demo = useDemo();
  const c = useColors();
  const me = demo.person(demo.seed.viewerId);
  const [settings, setSettings] = useState(true);
  const items = menuItems
    .filter((item) => !['profile', 'settings'].includes(item.id))
    .sort(
      (a, b) =>
        (order.includes(a.id) ? order.indexOf(a.id) : 99) -
        (order.includes(b.id) ? order.indexOf(b.id) : 99),
    );
  return (
    <Page style={{ gap: 14, paddingHorizontal: 12 }}>
      <Title
        aside={<IconButton name="settings" label="Open settings" onPress={() => go('/settings')} />}
      >
        Menu
      </Title>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="See your profile"
        onPress={() => go('/profile')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 6,
          paddingBottom: 14,
          gap: 12,
        }}
      >
        <Avatar image={me.avatar} size={44} />
        <View>
          <Label style={{ fontSize: 18, fontWeight: '700' }}>{me.name}</Label>
          <Muted>See your profile</Muted>
        </View>
      </Pressable>
      <Divider />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {items.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.label}
            key={item.id}
            onPress={() => go(item.href)}
            style={{
              width: '48.5%',
              minHeight: 95,
              padding: 14,
              justifyContent: 'space-between',
              backgroundColor: c.card,
              borderRadius: 9,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 3,
            }}
          >
            <Icon
              name={item.icon as React.ComponentProps<typeof Icon>['name']}
              color={item.id === 'saved' ? '#ae39ce' : c.blue}
              size={28}
            />
            <Label style={{ fontWeight: '600' }}>{item.label}</Label>
          </Pressable>
        ))}
      </View>
      <Card style={{ marginTop: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: settings }}
          accessibilityLabel="Settings & privacy"
          onPress={() => setSettings(!settings)}
          style={{ padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <Icon name="settings" color={c.secondary} />
          <Label style={{ flex: 1, fontWeight: '700', fontSize: 17 }}>Settings & privacy</Label>
          <Icon name={settings ? 'chevron-up' : 'chevron-down'} size={19} />
        </Pressable>
        {settings && (
          <View style={{ padding: 12, paddingTop: 0, gap: 8 }}>
            <Button
              title="Settings"
              secondary
              icon="settings"
              onPress={() => go('/settings')}
            />
            <Button
              title="Display & accessibility"
              secondary
              icon="moon-outline"
              onPress={() => go('/settings/display')}
            />
            <Button
              title="Privacy Checkup"
              secondary
              icon="shield-checkmark-outline"
              onPress={() => go('/privacy')}
            />
          </View>
        )}
      </Card>
      <Muted style={{ textAlign: 'center', padding: 12, fontSize: 11 }}>
        Unofficial hackathon demo · Your data stays on this device
      </Muted>
    </Page>
  );
}
