import { useState } from 'react';
import { useDemo } from '../../core/store';
import { menuItems, tabs } from '../../extensions/registry';
import { Avatar, Icon, Nav, PageTitle } from '../../ui/Controls.web';
export default function MenuScreen() {
  const { seed, person } = useDemo();
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="menu-page">
      <PageTitle title="Menu">
        <Nav className="icon-button" href="/settings" aria-label="Settings">
          <Icon name="settings" />
        </Nav>
        <Nav className="icon-button" href="/search" aria-label="Search menu">
          <Icon name="search" />
        </Nav>
      </PageTitle>
      <Nav href="/profile" className="menu-profile">
        <Avatar person={person(seed.viewerId)} size={44} />
        <div>
          <strong>{person(seed.viewerId).name}</strong>
          <small>See your profile</small>
        </div>
        <Icon name="chevron" />
      </Nav>
      <div className="menu-grid">
        {menuItems
          .filter((item) => !['profile', 'settings'].includes(item.id))
          // A feature's own tab destination (Plans) leads the Menu.
          .sort(
            (a, b) => +tabs.some((t) => t.href === b.href) - +tabs.some((t) => t.href === a.href),
          )
          .map((item) => (
            <Nav href={item.href} key={item.id} className="card menu-tile">
              <span className={`rail-icon rail-${item.id}`}>
                <Icon name={item.icon} size={28} />
              </span>
              <strong>{item.label}</strong>
            </Nav>
          ))}
      </div>
      <div className="menu-settings">
        <button
          className="menu-settings-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <Icon name="settings" size={27} />
          <strong>Settings &amp; privacy</strong>
          <Icon name={expanded ? 'down' : 'chevron'} />
        </button>
        {expanded && (
          <div className="menu-settings-links">
            <Nav href="/settings" className="card">
              <Icon name="settings" />
              Settings
            </Nav>
            <Nav href="/settings/display" className="card">
              <Icon name="moon" />
              Display &amp; accessibility
            </Nav>
            <Nav href="/privacy" className="card">
              <Icon name="shield" />
              Privacy Checkup
            </Nav>
          </div>
        )}
      </div>
      <p className="menu-disclaimer">
        Unofficial hackathon demo.
        <br />
        Not affiliated with or endorsed by Meta or Facebook.
      </p>
    </div>
  );
}
