import { useEffect, useRef, type ReactNode, type AnchorHTMLAttributes } from 'react';
import { router, type Href } from 'expo-router';
import { imageUri } from '../data/media';
import type { Person } from '../core/types';

const aliases: Record<string, string> = {
  people: 'friends',
  person: 'friends',
  storefront: 'marketplace',
  'people-circle': 'groups',
  'play-circle': 'video',
  bookmark: 'saved',
  time: 'memories',
  albums: 'feeds',
  calendar: 'events',
  videocam: 'live',
  images: 'photo',
  happy: 'feeling',
  open: 'comment',
  map: 'location',
};
const paths: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3Z',
  friends:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8m6 9v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  video: 'M3 4h18v14H3ZM9 8l6 3-6 3ZM8 22h8',
  marketplace:
    'M3 10v11h18V10M2 10l2-7h16l2 7M2 10c0 4 5 4 5 0 0 4 5 4 5 0 0 4 5 4 5 0 0 4 5 4 5 0M9 21v-7h6v7',
  groups:
    'M18 20v-2a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v2M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 14v-1a3 3 0 0 1 3-3m15 4v-1a3 3 0 0 0-3-3M4 7a2 2 0 1 0 0-4m16 4a2 2 0 1 1 0-4',
  search: 'M21 21l-5.1-5.1M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  menu: 'M4 4h2v2H4Zm7 0h2v2h-2Zm7 0h2v2h-2ZM4 11h2v2H4Zm7 0h2v2h-2Zm7 0h2v2h-2ZM4 18h2v2H4Zm7 0h2v2h-2Zm7 0h2v2h-2Z',
  messenger: 'M21 11.5a9 9 0 0 1-13 8L3 21l1.3-5A9 9 0 1 1 21 11.5ZM6 14l4-5 4 3 4-3-4 6-4-3Z',
  notifications: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  chevron: 'm9 5 7 7-7 7',
  down: 'm6 9 6 6 6-6',
  back: 'm12 5-7 7 7 7M5 12h16',
  close: 'm6 6 12 12M6 18 18 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  saved: 'M5 3h14v18l-7-5-7 5Z',
  memories: 'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2',
  feeds: 'M4 4h16v4H4Zm0 8h7v8H4Zm11 0h5m-5 4h5m-5 4h5',
  events: 'M4 5h16v16H4ZM4 10h16M8 2v6m8-6v6M8 14h3v3H8Z',
  photo: 'M3 3h18v18H3Zm0 15 6-6 4 4 3-3 5 5M8 7h.01',
  live: 'M2 6h13v12H2Zm13 4 7-4v12l-7-4',
  feeling: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM8 9h.01M16 9h.01M7 14c2 4 8 4 10 0',
  like: 'M7 10v11H2V10Zm0 0 5-8c3 0 2 5 1 7h6a3 3 0 0 1 3 3l-2 7a3 3 0 0 1-3 2H7',
  comment: 'M21 11a9 9 0 0 1-9 9H3l1.6-4.3A9 9 0 1 1 21 11Z',
  share: 'M13 3v5C4 8 2 13 2 20c4-5 7-6 11-6v5l9-8Z',
  globe: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c-6 6-6 14 0 20 6-6 6-14 0-20Z',
  lock: 'M5 10h14v11H5Zm3 0V6a4 4 0 0 1 8 0v4',
  settings:
    'M9.05 4.89 10.4 4.47 10.4 1.93 13.6 1.93 13.6 4.47 14.95 4.89 16.19 5.54 18 3.75 20.25 6 18.46 7.81 19.11 9.05 19.53 10.4 22.07 10.4 22.07 13.6 19.53 13.6 19.11 14.95 18.46 16.19 20.25 18 18 20.25 16.19 18.46 14.95 19.11 13.6 19.53 13.6 22.07 10.4 22.07 10.4 19.53 9.05 19.11 7.81 18.46 6 20.25 3.75 18 5.54 16.19 4.89 14.95 4.47 13.6 1.93 13.6 1.93 10.4 4.47 10.4 4.89 9.05 5.54 7.81 3.75 6 6 3.75 7.81 5.54 9.05 4.89Z M15.3 12a3.3 3.3 0 1 1-6.6 0 3.3 3.3 0 1 1 6.6 0Z',
  moon: 'M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z',
  edit: 'm16 3 5 5L8 21H3v-5ZM13 6l5 5',
  location: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  work: 'M3 7h18v14H3Zm5 0V3h8v4M3 13h18m-11 0v3h4v-3',
  send: 'm22 2-7 20-4-9-9-4Zm0 0L11 13',
  check: 'm4 12 5 5L20 6',
  birthday: 'M3 12h18v9H3Zm0 5h18M6 12V8m6 4V8m6 4V8M6 5V3m6 2V3m6 2V3',
  filter: 'M3 5h18M6 12h12M9 19h6',
  shield: 'm12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6Z',
};
export function Icon({
  name,
  size = 22,
  className = '',
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'settings' ? 'currentColor' : 'none'}
      fillRule="evenodd"
      stroke={name === 'settings' ? 'none' : 'currentColor'}
      strokeWidth={name === 'more' ? 4 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[aliases[name] || name] || paths.groups} />
    </svg>
  );
}
export function Nav({
  href,
  children,
  onClick,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string; children: ReactNode }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          event.button === 0
        ) {
          event.preventDefault();
          router.push(href as Href);
        }
      }}
    >
      {children}
    </a>
  );
}
export function Avatar({
  person,
  size = 40,
  online = false,
}: {
  person: Person;
  size?: number;
  online?: boolean;
}) {
  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
      <img
        className="avatar"
        src={imageUri(person.avatar)}
        alt={person.name}
        width={size}
        height={size}
      />
      {online && <span className="online-dot" />}
    </span>
  );
}
export function IconButton({
  icon,
  label,
  onClick,
  className = '',
  children,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      className={`icon-button ${className}`}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}
export function Modal({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`dialog ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2>{title}</h2>
          <IconButton icon="close" label="Close dialog" onClick={onClose} />
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Empty({
  title,
  text,
  icon = 'search',
}: {
  title: string;
  text: string;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={38} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
export function PageTitle({
  title,
  subtitle,
  back = false,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="page-title">
      {back && (
        <IconButton
          icon="back"
          label="Go back"
          onClick={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      )}
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
export function AudienceIcon({ audience }: { audience: string }) {
  return (
    <Icon
      name={audience === 'Public' ? 'globe' : audience === 'Only me' ? 'lock' : 'friends'}
      size={12}
    />
  );
}
