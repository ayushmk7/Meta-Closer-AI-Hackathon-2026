import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import type { Audience, NotificationCategory } from '../../core/types';
import { Icon, Modal, Nav, PageTitle } from '../../ui/Controls.web';
const sections = [
  ['display', 'Display & accessibility', 'moon'],
  ['notifications', 'Notifications', 'notifications'],
  ['feed', 'Feed preferences', 'feeds'],
  ['audience', 'Audience and visibility', 'shield'],
  ['reset', 'Reset demo', 'memories'],
];
export default function SettingsScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { state, actions } = useDemo();
  const [reset, setReset] = useState(false),
    [error, setError] = useState('');
  const values: Record<string, string> = {
    display: state.settings.theme === 'light' ? 'Light' : 'Dark',
    notifications: `${Object.values(state.settings.notifications).filter(Boolean).length} categories on`,
    feed: state.settings.feedOrder === 'curated' ? 'Curated order' : 'Most recent',
    audience: state.settings.audience,
    reset: 'Restore the original demo',
  };
  const current = sections.find((item) => item[0] === section);
  function categoryRows(ids: string[]) {
    return sections
      .filter((item) => ids.includes(item[0]))
      .map(([id, label, icon]) => (
        <Nav key={id} href={`/settings/${id}`} className="setting-category">
          <Icon name={icon} size={24} />
          <span>
            <strong>{label}</strong>
            <small>{values[id]}</small>
          </span>
          <Icon name="chevron" size={20} />
        </Nav>
      ));
  }
  return (
    <div className="section-layout settings-layout">
      <aside className="section-sidebar settings-sidebar">
        <h1>Settings &amp; privacy</h1>
        <Nav href="/settings" className={`section-nav-row ${!section ? 'active' : ''}`}>
          <span className="menu-icon">
            <Icon name="settings" />
          </span>
          <strong>Settings</strong>
        </Nav>
        <h3>Preferences</h3>
        {sections.map(([id, label, icon]) => (
          <Nav
            key={id}
            href={`/settings/${id}`}
            className={`section-nav-row ${section === id ? 'active' : ''}`}
          >
            <span className="menu-icon">
              <Icon name={icon} />
            </span>
            <strong>{label}</strong>
          </Nav>
        ))}
        <div className="rail-divider" />
        <Nav href="/privacy" className="section-nav-row">
          <span className="menu-icon">
            <Icon name="shield" />
          </span>
          <strong>Privacy Checkup</strong>
        </Nav>
      </aside>
      <div className="settings-main">
        <PageTitle
          title={current?.[1] || 'Settings & privacy'}
          subtitle={!section ? 'Manage your preferences and what you share.' : undefined}
          back
        />
        {!section && (
          <>
            <section className="card settings-group">
              <header>
                <h2>Preferences</h2>
                <p>Customize your experience on Facebook.</p>
              </header>
              {categoryRows(['display', 'notifications', 'feed'])}
            </section>
            <section className="card settings-group">
              <header>
                <h2>Audience and visibility</h2>
                <p>Control who can see what you share.</p>
              </header>
              {categoryRows(['audience'])}
              <Nav className="setting-category" href="/privacy">
                <Icon name="shield" />
                <span>
                  <strong>Privacy Checkup</strong>
                  <small>Review your audience settings</small>
                </span>
                <Icon name="chevron" />
              </Nav>
            </section>
            <section className="card settings-group">
              <header>
                <h2>Your demo</h2>
                <p>Your changes are stored on this device.</p>
              </header>
              {categoryRows(['reset'])}
            </section>
          </>
        )}
        {section === 'display' && (
          <section className="card settings-detail">
            <h2>Dark mode</h2>
            <p>Choose the appearance that’s most comfortable for you.</p>
            {(['light', 'dark'] as const).map((mode) => (
              <label className="setting-radio" key={mode}>
                <span>
                  <strong>{mode === 'light' ? 'Light' : 'Dark'}</strong>
                  <small>
                    {mode === 'light'
                      ? 'A bright, familiar look.'
                      : 'Reduce glare with a darker background.'}
                  </small>
                </span>
                <input
                  type="radio"
                  name="theme"
                  aria-label={mode === 'light' ? 'Light' : 'Dark'}
                  checked={state.settings.theme === mode}
                  onChange={() => actions.updateSettings({ theme: mode })}
                />
              </label>
            ))}
          </section>
        )}
        {section === 'notifications' && (
          <section className="card settings-detail">
            <h2>Notification preferences</h2>
            <p>Choose what appears in your notifications. These settings affect this local demo.</p>
            {(
              [
                ['friends', 'Friend activity'],
                ['posts', 'Post activity'],
                ['marketplace', 'Marketplace'],
                ['messages', 'Messages'],
              ] as [NotificationCategory, string][]
            ).map(([key, label]) => (
              <label className="setting-radio" key={key}>
                <span>
                  <strong>{label}</strong>
                  <small>{state.settings.notifications[key] ? 'On' : 'Off'}</small>
                </span>
                <input
                  className="toggle"
                  type="checkbox"
                  role="switch"
                  aria-label={label}
                  checked={state.settings.notifications[key]}
                  onChange={(e) =>
                    actions.updateSettings({
                      notifications: { ...state.settings.notifications, [key]: e.target.checked },
                    })
                  }
                />
              </label>
            ))}
          </section>
        )}
        {section === 'feed' && (
          <section className="card settings-detail">
            <h2>How posts are ordered</h2>
            <p>Choose how you catch up with your community.</p>
            {(['curated', 'recent'] as const).map((value) => (
              <label className="setting-radio" key={value}>
                <span>
                  <strong>{value === 'curated' ? 'Curated order' : 'Most recent'}</strong>
                  <small>
                    {value === 'curated'
                      ? 'The original selection of community posts.'
                      : 'Posts with the newest timestamps first.'}
                  </small>
                </span>
                <input
                  type="radio"
                  name="feed-order"
                  aria-label={value === 'curated' ? 'Curated order' : 'Most recent'}
                  checked={state.settings.feedOrder === value}
                  onChange={() => actions.updateSettings({ feedOrder: value })}
                />
              </label>
            ))}
          </section>
        )}
        {section === 'audience' && (
          <section className="card settings-detail">
            <h2>Who can see your future posts?</h2>
            <p>
              This will be the default audience when you create a post. You can change it for each
              post.
            </p>
            {(['Public', 'Friends', 'Only me'] as Audience[]).map((value) => (
              <label className="setting-radio" key={value}>
                <Icon
                  name={value === 'Public' ? 'globe' : value === 'Friends' ? 'friends' : 'lock'}
                  size={28}
                />
                <span>
                  <strong>{value}</strong>
                  <small>
                    {value === 'Public'
                      ? 'Anyone in this demo'
                      : value === 'Friends'
                        ? 'People in your friends list'
                        : 'Only visible to your account'}
                  </small>
                </span>
                <input
                  type="radio"
                  name="audience"
                  aria-label={value}
                  checked={state.settings.audience === value}
                  onChange={() => actions.updateSettings({ audience: value })}
                />
              </label>
            ))}
          </section>
        )}
        {section === 'reset' && (
          <section className="card settings-detail">
            <h2>Start fresh</h2>
            <p>
              Remove your demo posts, comments, messages, saved items, profile edits and
              preferences. The original community and feed will be restored.
            </p>
            <p>Only this demo’s data will be removed.</p>
            <button className="button danger" onClick={() => setReset(true)}>
              Reset demo
            </button>
          </section>
        )}
        {section && !current && (
          <section className="card settings-detail">
            <h2>Setting not found</h2>
            <Nav className="button primary" href="/settings">
              Back to Settings
            </Nav>
          </section>
        )}
      </div>
      {reset && (
        <Modal title="Reset demo?" onClose={() => setReset(false)}>
          <div className="dialog-body">
            <p>Your local changes will be removed. This can’t be undone.</p>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <div className="dialog-buttons">
              <button className="button neutral" onClick={() => setReset(false)}>
                Cancel
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  try {
                    await actions.reset();
                    setReset(false);
                    router.replace('/');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not reset the demo.');
                  }
                }}
              >
                Reset demo
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
