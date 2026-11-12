import React from 'react';
import { Pressable, View } from 'react-native';
import { useDemo } from '../../core/store';
import {
  Avatar,
  Button,
  Card,
  Empty,
  go,
  Icon,
  Label,
  Muted,
  Page,
  Title,
  useColors,
} from '../../ui/native';
export default function NotificationsScreen() {
  const demo = useDemo();
  const c = useColors();
  return (
    <Page>
      <Card style={{ borderRadius: 0 }}>
        <Title>Notifications</Title>
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Label style={{ flex: 1, fontWeight: '700' }}>
            {demo.unreadCount ? `${demo.unreadCount} unread` : 'All caught up'}
          </Label>
          <Button
            title="Mark all as read"
            secondary
            disabled={demo.unreadCount === 0}
            onPress={demo.actions.markAllNotificationsRead}
          />
        </View>
        {demo.notifications.map((notification) => {
          const person = demo.person(notification.personId);
          return (
            <Pressable
              key={notification.id}
              accessibilityRole="button"
              accessibilityLabel={`${notification.read ? '' : 'Unread: '}${notification.text}`}
              onPress={() => {
                demo.actions.markNotificationRead(notification.id);
                go(notification.href);
              }}
              style={{
                flexDirection: 'row',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 15,
                backgroundColor: notification.read
                  ? c.card
                  : demo.state.settings.theme === 'dark'
                    ? '#26374b'
                    : '#edf5ff',
              }}
            >
              <View>
                <Avatar image={person.avatar} size={56} />
                <View
                  style={{
                    position: 'absolute',
                    right: -3,
                    bottom: -3,
                    backgroundColor: c.blue,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon
                    name={
                      notification.category === 'friends'
                        ? 'people'
                        : notification.category === 'posts'
                          ? 'thumbs-up'
                          : notification.category === 'marketplace'
                            ? 'storefront'
                            : 'chatbubble'
                    }
                    size={13}
                    color="#fff"
                  />
                </View>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Label style={{ fontWeight: notification.read ? '400' : '600' }}>
                  {notification.text}
                </Label>
                <Muted style={{ color: notification.read ? c.secondary : c.blue }}>
                  {notification.time}
                </Muted>
              </View>
              {!notification.read && (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: c.blue,
                    alignSelf: 'center',
                  }}
                />
              )}
            </Pressable>
          );
        })}
        {!demo.notifications.length && (
          <Empty
            title="No notifications enabled"
            message="Turn on categories in Settings to see your local notifications."
          />
        )}
        <View style={{ padding: 16 }}>
          <Button
            title="Notification preferences"
            secondary
            onPress={() => go('/settings/notifications')}
          />
        </View>
      </Card>
    </Page>
  );
}
