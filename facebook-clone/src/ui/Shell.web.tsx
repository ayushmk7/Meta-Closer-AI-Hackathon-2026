import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { router, usePathname, type Href } from 'expo-router';
import { useDemo } from '../core/store';
import { imageUri } from '../data/media';
import { Avatar, Icon, IconButton, Nav } from './Controls.web';
import { NotificationList } from '../features/notifications/index.web';
import { ChatPanel, ConversationList } from '../features/messenger/index.web';
import './styles.web.css';
const ChatContext = createContext<(id: string) => void>(() => {});
export const useOpenChat = () => useContext(ChatContext);
const primary = [
  ['/', 'Home', 'home'],
  ['/friends', 'Friends', 'friends'],
  ['/video', 'Video', 'video'],
  ['/marketplace', 'Marketplace', 'marketplace'],
  ['/groups', 'Groups', 'groups'],
];
const rail = [
  ['/friends', 'Friends', 'friends'],
  ['/memories', 'Memories', 'memories'],
  ['/saved', 'Saved', 'saved'],
  ['/groups', 'Groups', 'groups'],
  ['/video', 'Video', 'video'],
  ['/marketplace', 'Marketplace', 'marketplace'],
  ['/feeds', 'Feeds', 'feeds'],
  ['/events', 'Events', 'events'],
];
const mobile = [
  ['/', 'Home', 'home'],
  ['/friends', 'Friends', 'friends'],
  ['/marketplace', 'Marketplace', 'marketplace'],
  ['/notifications', 'Notifications', 'notifications'],
  ['/menu', 'Menu', 'menu'],
];
export default function Shell({ children }: { children: ReactNode }) {
  const {
    ready,
    error,
    clearError,
    person,
    seed,
    unreadCount,
    state,
    actions,
    conversationFor,
    friends,
  } = useDemo();
  const pathname = usePathname(),
    viewer = person(seed.viewerId);
  const [panel, setPanel] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [chat, setChat] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const isHome = ['/', '/feeds', '/saved', '/memories'].includes(pathname);
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.style.colorScheme = state.settings.theme;
  }, [state.settings.theme]);
  useEffect(() => {
    setPanel(null);
    setChat(null);
    window.scrollTo({ top: 0 });
  }, [pathname]);
  useEffect(() => {
    if (!panel) return;
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPanel(null);
        opener.current?.focus();
      }
    }
    function outside(e: MouseEvent) {
      if (
        !panelRef.current?.contains(e.target as Node) &&
        !(e.target as Element).closest('[data-panel-trigger]')
      )
        setPanel(null);
    }
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', outside);
    panelRef.current?.querySelector<HTMLElement>('button,a,input')?.focus();
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('mousedown', outside);
    };
  }, [panel]);
  function toggle(name: string) {
    opener.current = document.activeElement as HTMLElement;
    setPanel(panel === name ? null : name);
  }
  function openChat(id: string) {
    if (window.innerWidth < 768) router.push(`/messages/${id}` as Href);
    else {
      setPanel(null);
      setChat(id);
    }
  }
  const contacts = [...new Set([...seed.contacts, ...friends.map((p) => p.id)])].map((id) =>
    person(id),
  );
  return (
    <ChatContext.Provider value={openChat}>
      <div className="web-app">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="topbar">
          <div className="topbar-brand">
            <Nav href="/" aria-label="Facebook Home" className="brand">
              <img src={imageUri('facebook-logo')} width="40" height="40" alt="Facebook" />
            </Nav>
            <form
              className="header-search search-input"
              onSubmit={(e) => {
                e.preventDefault();
                router.push(`/search?q=${encodeURIComponent(query)}` as Href);
              }}
            >
              <Icon name="search" size={18} />
              <input
                aria-label="Search Facebook"
                placeholder="Search Facebook"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </form>
          </div>
          <nav className="desktop-tabs" aria-label="Main navigation">
            {primary.map(([href, label, icon]) => (
              <Nav
                key={href}
                href={href}
                className={`top-tab ${pathname === href || (href !== '/' && pathname.startsWith(`${href}/`)) ? 'active' : ''}`}
                aria-label={label}
                title={label}
              >
                <Icon name={icon} size={26} />
              </Nav>
            ))}
          </nav>
          <div className="header-actions">
            <Nav href="/search" className="icon-button mobile-search" aria-label="Search">
              <Icon name="search" />
            </Nav>
            <Nav
              href="/menu"
              className={`icon-button header-menu ${pathname === '/menu' ? 'active' : ''}`}
              aria-label="Menu"
            >
              <Icon name="menu" />
            </Nav>
            <button
              className={`icon-button ${panel === 'messages' ? 'active' : ''}`}
              data-panel-trigger
              aria-label="Messenger"
              onClick={() =>
                window.innerWidth < 768 ? router.push('/messages') : toggle('messages')
              }
            >
              <Icon name="messenger" />
            </button>
            <button
              className={`icon-button desktop-notifications ${panel === 'notifications' ? 'active' : ''}`}
              data-panel-trigger
              aria-label="Notifications"
              onClick={() => toggle('notifications')}
            >
              <Icon name="notifications" />
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>
            <button
              className="account-trigger"
              data-panel-trigger
              aria-label="Account"
              onClick={() => toggle('account')}
            >
              <Avatar person={viewer} />
              <span className="account-chevron">
                <Icon name="down" size={10} />
              </span>
            </button>
          </div>
        </header>
        {panel && (
          <div
            className={`header-panel ${panel === 'notifications' || panel === 'messages' ? 'wide-panel' : ''}`}
            ref={panelRef}
            role="region"
            aria-label={panel === 'account' ? 'Account menu' : panel}
          >
            {panel === 'account' && (
              <>
                <Nav href="/profile" className="account-profile">
                  <Avatar person={viewer} />
                  <strong>{viewer.name}</strong>
                  <Icon name="chevron" size={18} />
                </Nav>
                <button className="menu-row" onClick={() => setPanel('privacy')}>
                  <span className="menu-icon">
                    <Icon name="settings" />
                  </span>
                  <strong>Settings &amp; privacy</strong>
                  <Icon name="chevron" />
                </button>
                <button className="menu-row" onClick={() => setPanel('display')}>
                  <span className="menu-icon">
                    <Icon name="moon" />
                  </span>
                  <strong>Display &amp; accessibility</strong>
                  <Icon name="chevron" />
                </button>
                <Nav href="/saved" className="menu-row">
                  <span className="menu-icon">
                    <Icon name="saved" />
                  </span>
                  <strong>Saved</strong>
                  <Icon name="chevron" />
                </Nav>
                <p className="menu-footnote">Unofficial hackathon demo · Local account</p>
              </>
            )}
            {panel === 'privacy' && (
              <>
                <div className="panel-heading">
                  <IconButton
                    icon="back"
                    label="Back to account"
                    onClick={() => setPanel('account')}
                  />
                  <h2>Settings &amp; privacy</h2>
                </div>
                <Nav href="/settings" className="menu-row">
                  <span className="menu-icon">
                    <Icon name="settings" />
                  </span>
                  <strong>Settings</strong>
                </Nav>
                <Nav href="/privacy" className="menu-row">
                  <span className="menu-icon">
                    <Icon name="shield" />
                  </span>
                  <strong>Privacy Checkup</strong>
                </Nav>
              </>
            )}
            {panel === 'display' && (
              <>
                <div className="panel-heading">
                  <IconButton
                    icon="back"
                    label="Back to account"
                    onClick={() => setPanel('account')}
                  />
                  <h2>Display &amp; accessibility</h2>
                </div>
                <h3 className="section-label">Dark mode</h3>
                <p className="muted panel-copy">Adjust the appearance to reduce glare.</p>
                {(['light', 'dark'] as const).map((mode) => (
                  <label className="setting-radio" key={mode}>
                    <span>{mode === 'light' ? 'Off' : 'On'}</span>
                    <input
                      type="radio"
                      name="quick-theme"
                      checked={state.settings.theme === mode}
                      onChange={() => actions.updateSettings({ theme: mode })}
                    />
                  </label>
                ))}
              </>
            )}
            {panel === 'notifications' && <NotificationList onNavigate={() => setPanel(null)} />}
            {panel === 'messages' && (
              <>
                <ConversationList onSelect={openChat} />
                <Nav href="/messages" className="panel-footer-link">
                  See all in Messenger
                </Nav>
              </>
            )}
          </div>
        )}
        {error && (
          <div className="storage-error" role="alert">
            <span>{error}</span>
            <button onClick={clearError}>Dismiss</button>
          </div>
        )}
        {!ready ? (
          <main className="loading" aria-busy="true">
            Loading your demo…
          </main>
        ) : (
          <div className={isHome ? 'home-layout' : 'page-layout'}>
            {isHome && (
              <aside className="left-rail" aria-label="Explore">
                <Nav href="/profile" className="rail-row">
                  <Avatar person={viewer} size={36} />
                  <strong>{viewer.name}</strong>
                </Nav>
                {rail.map(([href, label, icon]) => (
                  <Nav
                    href={href}
                    key={href}
                    className={`rail-row ${pathname === href ? 'active' : ''}`}
                  >
                    <span className={`rail-icon rail-${icon}`}>
                      <Icon name={icon} size={27} />
                    </span>
                    <strong>{label}</strong>
                  </Nav>
                ))}
                <Nav href="/menu" className="rail-row">
                  <span className="round-muted">
                    <Icon name="down" />
                  </span>
                  <strong>See more</strong>
                </Nav>
                <div className="rail-divider" />
                <h3>Your shortcuts</h3>
                {seed.groups.map((group) => (
                  <Nav href={`/groups?group=${group.id}`} key={group.id} className="rail-row">
                    <img className="shortcut-image" src={imageUri(group.image)} alt="" />
                    <strong>{group.name}</strong>
                  </Nav>
                ))}
                <footer className="rail-footer">
                  <Nav href="/privacy">Privacy</Nav> · <Nav href="/settings">Settings</Nav> ·{' '}
                  <Nav href="/menu">More</Nav>
                  <br />
                  Unofficial hackathon demo · 2026
                </footer>
              </aside>
            )}
            <main id="main" className={isHome ? 'home-main' : 'page-main'}>
              {children}
            </main>
            {isHome && (
              <aside className="right-rail" aria-label="Contacts">
                <div className="contacts-heading">
                  <h3>Contacts</h3>
                  <Nav href="/search" aria-label="Search contacts">
                    <Icon name="search" size={18} />
                  </Nav>
                  <Nav href="/messages" aria-label="Open Messenger">
                    <Icon name="more" size={20} />
                  </Nav>
                </div>
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    className="rail-row contact-row"
                    onClick={() => openChat(conversationFor(contact.id))}
                  >
                    <Avatar person={contact} size={36} online={contact.online} />
                    <strong>{contact.name}</strong>
                  </button>
                ))}
                <div className="rail-divider" />
                <h3>Community chats</h3>
                {seed.groups.map((group) => (
                  <Nav href={`/groups?group=${group.id}`} className="rail-row" key={group.id}>
                    <img className="shortcut-image circle" src={imageUri(group.image)} alt="" />
                    <strong>{group.name}</strong>
                  </Nav>
                ))}
                <Nav href="/messages" className="rail-row">
                  <span className="round-muted">
                    <Icon name="messenger" size={18} />
                  </span>
                  <strong>Open Messenger</strong>
                </Nav>
              </aside>
            )}
          </div>
        )}
        <nav className="mobile-tabs" aria-label="Mobile navigation">
          {mobile.map(([href, label, icon]) => (
            <Nav
              href={href}
              key={href}
              className={
                pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
                  ? 'active'
                  : ''
              }
            >
              <span>
                <Icon name={icon} size={24} />
                {href === '/notifications' && unreadCount > 0 && (
                  <span className="badge">{unreadCount}</span>
                )}
              </span>
              <small>{label}</small>
            </Nav>
          ))}
        </nav>
        {chat && (
          <aside className="chat-drawer" aria-label="Messenger conversation">
            <ChatPanel key={chat} id={chat} onClose={() => setChat(null)} />
          </aside>
        )}
      </div>
    </ChatContext.Provider>
  );
}
