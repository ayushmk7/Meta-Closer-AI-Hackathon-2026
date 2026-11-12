import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { useDemo } from '../../core/store';
import { Avatar, Empty, Icon, PageTitle } from '../../ui/Controls.web';
export function NotificationList({ onNavigate }: { onNavigate?: () => void }) {
  const { notifications, actions } = useDemo();
  const { person } = useDemo();
  const [unread, setUnread] = useState(false);
  const shown = notifications.filter((n) => !unread || !n.read);
  return (
    <>
      <div className="panel-heading">
        <h2>Notifications</h2>
        <button className="text-button" onClick={() => actions.markAllNotificationsRead()}>
          Mark all as read
        </button>
      </div>
      <div className="chip-row">
        <button className={`chip ${!unread ? 'active' : ''}`} onClick={() => setUnread(false)}>
          All
        </button>
        <button className={`chip ${unread ? 'active' : ''}`} onClick={() => setUnread(true)}>
          Unread
        </button>
      </div>
      <h3 className="section-label">Earlier</h3>
      {shown.length ? (
        shown.map((notification) => (
          <button
            key={notification.id}
            className={`notification-row ${!notification.read ? 'unread' : ''}`}
            onClick={() => {
              actions.markNotificationRead(notification.id);
              onNavigate?.();
              router.push(notification.href as Href);
            }}
          >
            <span className="notification-avatar">
              <Avatar person={person(notification.personId)} size={56} />
              <span className="notification-kind">
                <Icon
                  name={
                    notification.category === 'posts'
                      ? 'comment'
                      : notification.category === 'messages'
                        ? 'messenger'
                        : notification.category === 'marketplace'
                          ? 'marketplace'
                          : 'friends'
                  }
                  size={15}
                />
              </span>
            </span>
            <span className="notification-copy">
              <span>{notification.text}</span>
              <small>{notification.time}</small>
            </span>
            {!notification.read && <span className="unread-dot" />}
          </button>
        ))
      ) : (
        <Empty
          title="You’re all caught up"
          text="No notifications to show with these preferences."
          icon="notifications"
        />
      )}
    </>
  );
}
export default function NotificationsScreen() {
  return (
    <div className="narrow-page">
      <PageTitle title="Notifications" />
      <section className="card notifications-page">
        <NotificationList />
      </section>
    </div>
  );
}
