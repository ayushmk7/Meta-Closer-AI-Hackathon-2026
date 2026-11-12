import { seed } from '../data/seed';
import { mediaKeys } from '../data/mediaKeys';
import type {
  Audience,
  Comment,
  DemoState,
  Message,
  Post,
  ProfileEdits,
  Reaction,
  SearchResult,
  Settings,
  Story,
} from './types';

export const STORAGE_KEY = 'facebook-clone-demo:v1';
export const MAX_STORAGE_CHARS = 3_500_000;
export const reactions: Reaction[] = ['Like', 'Love', 'Care', 'Haha', 'Wow', 'Sad', 'Angry'];
export const audiences: Audience[] = ['Public', 'Friends', 'Only me'];

export function initialState(): DemoState {
  return {
    version: 1,
    nextId: 1,
    posts: [],
    stories: [],
    comments: {},
    reactions: {},
    savedPostIds: [],
    savedListingIds: [],
    requestDecisions: {},
    sentRequestIds: [],
    readNotificationIds: [],
    messages: {},
    settings: { ...seed.settings, notifications: { ...seed.settings.notifications } },
    profile: {},
  };
}

export type DemoAction =
  | { type: 'replace'; value: DemoState }
  | { type: 'post'; post: Post }
  | { type: 'story'; story: Story }
  | { type: 'comment'; postId: string; comment: Comment }
  | { type: 'reaction'; postId: string; reaction: Reaction }
  | { type: 'savePost'; postId: string }
  | { type: 'saveListing'; listingId: string }
  | { type: 'request'; requestId: string; decision: 'confirmed' | 'deleted' }
  | { type: 'sendRequest'; personId: string }
  | { type: 'read'; ids: string[] }
  | { type: 'message'; conversationId: string; message: Message }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'profile'; patch: Partial<ProfileEdits> };

const toggle = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
const knownPerson = (id: string) => seed.people.some((person) => person.id === id);
const knownPost = (state: DemoState, id: string) =>
  [...seed.posts, ...state.posts].some((post) => post.id === id);
export const knownConversation = (id: string) =>
  id.startsWith('chat-') && knownPerson(id.slice(5)) && id !== `chat-${seed.viewerId}`;
export const validMedia = (value: unknown): value is string =>
  typeof value === 'string' &&
  ((mediaKeys as readonly string[]).includes(value) ||
    (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) &&
      value.length <= 500_000) ||
    /^file:\/\/[^\n]*\/facebook-clone-demo\/photos\/[\w.-]+\.jpg$/.test(value));

export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'replace':
      return action.value;
    case 'post':
      return action.post.text.trim() &&
        action.post.text.length <= 5000 &&
        audiences.includes(action.post.audience) &&
        action.post.photos.every(validMedia)
        ? { ...state, nextId: state.nextId + 1, posts: [action.post, ...state.posts] }
        : state;
    case 'story':
      return validMedia(action.story.image)
        ? { ...state, nextId: state.nextId + 1, stories: [action.story, ...state.stories] }
        : state;
    case 'comment':
      return knownPost(state, action.postId) &&
        action.comment.text.trim() &&
        action.comment.text.length <= 2000
        ? {
            ...state,
            nextId: state.nextId + 1,
            comments: {
              ...state.comments,
              [action.postId]: [...(state.comments[action.postId] ?? []), action.comment],
            },
          }
        : state;
    case 'reaction': {
      if (!knownPost(state, action.postId) || !reactions.includes(action.reaction)) return state;
      const next = { ...state.reactions };
      if (next[action.postId] === action.reaction) delete next[action.postId];
      else next[action.postId] = action.reaction;
      return { ...state, reactions: next };
    }
    case 'savePost':
      return knownPost(state, action.postId)
        ? { ...state, savedPostIds: toggle(state.savedPostIds, action.postId) }
        : state;
    case 'saveListing':
      return seed.listings.some((listing) => listing.id === action.listingId)
        ? { ...state, savedListingIds: toggle(state.savedListingIds, action.listingId) }
        : state;
    case 'request':
      return seed.requests.some((request) => request.id === action.requestId) &&
        !state.requestDecisions[action.requestId]
        ? {
            ...state,
            requestDecisions: { ...state.requestDecisions, [action.requestId]: action.decision },
          }
        : state;
    case 'sendRequest':
      return knownPerson(action.personId) &&
        action.personId !== seed.viewerId &&
        !friendIds(state).includes(action.personId) &&
        !state.sentRequestIds.includes(action.personId)
        ? { ...state, sentRequestIds: [...state.sentRequestIds, action.personId] }
        : state;
    case 'read':
      return {
        ...state,
        readNotificationIds: [
          ...new Set([
            ...state.readNotificationIds,
            ...action.ids.filter((id) =>
              seed.notifications.some((notification) => notification.id === id),
            ),
          ]),
        ],
      };
    case 'message':
      return knownConversation(action.conversationId) &&
        action.message.text.trim() &&
        action.message.text.length <= 2000
        ? {
            ...state,
            nextId: state.nextId + 1,
            messages: {
              ...state.messages,
              [action.conversationId]: [
                ...(state.messages[action.conversationId] ?? []),
                action.message,
              ],
            },
          }
        : state;
    case 'settings': {
      const next = {
        ...state.settings,
        ...action.patch,
        notifications: { ...state.settings.notifications, ...action.patch.notifications },
      };
      return validSettings(next) ? { ...state, settings: next } : state;
    }
    case 'profile': {
      const next = { ...state.profile, ...action.patch };
      return validProfile(next) ? { ...state, profile: next } : state;
    }
  }
}

export function ownedPhotoRefs(state: DemoState): string[] {
  return [
    ...new Set(
      [
        ...state.posts.flatMap((post) => post.photos),
        ...state.stories.map((story) => story.image),
        state.profile.avatar,
        state.profile.cover,
      ].filter((ref): ref is string => typeof ref === 'string' && ref.startsWith('file://')),
    ),
  ];
}

export function selectPosts(state: DemoState): Post[] {
  const posts = [...state.posts, ...seed.posts].map((post) => ({
    ...post,
    reactionCount: post.reactionCount + (state.reactions[post.id] ? 1 : 0),
    comments: [...post.comments, ...(state.comments[post.id] ?? [])],
  }));
  return state.settings.feedOrder === 'recent'
    ? posts.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    : posts;
}
export function friendIds(state: DemoState): string[] {
  return [
    ...seed.friendIds,
    ...seed.requests
      .filter((request) => state.requestDecisions[request.id] === 'confirmed')
      .map((request) => request.personId),
  ];
}
export function selectPerson(state: DemoState, id: string) {
  const person = seed.people.find((person) => person.id === id) ?? seed.people[0];
  return person.id === seed.viewerId ? { ...person, ...state.profile } : person;
}
export function selectStories(state: DemoState): Story[] {
  return [...state.stories, ...seed.stories];
}
export function selectNotifications(state: DemoState) {
  return seed.notifications
    .filter((notification) => state.settings.notifications[notification.category])
    .map((notification) => ({
      ...notification,
      read: notification.read || state.readNotificationIds.includes(notification.id),
    }));
}
export function selectMessages(state: DemoState, id: string): Message[] {
  return [
    ...(seed.conversations.find((conversation) => conversation.id === id)?.messages ?? []),
    ...(state.messages[id] ?? []),
  ];
}

export function searchContent(state: DemoState, query: string): SearchResult[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const matches = (...parts: string[]) => parts.join(' ').toLocaleLowerCase().includes(q);
  return [
    ...seed.people
      .filter((person) => matches(person.name, selectPerson(state, person.id).bio))
      .map((person) => ({
        id: person.id,
        kind: 'People' as const,
        title: person.name,
        subtitle: person.location,
        image: selectPerson(state, person.id).avatar,
        href: `/profile/${person.id}`,
      })),
    ...selectPosts(state)
      .filter((post) =>
        matches(post.text, selectPerson(state, post.authorId).name, post.link?.title ?? ''),
      )
      .map((post) => ({
        id: post.id,
        kind: 'Posts' as const,
        title: selectPerson(state, post.authorId).name,
        subtitle: post.text,
        image: post.photos[0] ?? post.link?.image,
        href: `/posts/${post.id}`,
      })),
    ...selectStories(state)
      .filter((story) => matches(story.text ?? '', selectPerson(state, story.authorId).name))
      .map((story) => ({
        id: story.id,
        kind: 'Stories' as const,
        title: `${selectPerson(state, story.authorId).name}’s story`,
        subtitle: story.text ?? '',
        image: story.image,
        href: `/stories/${story.id}`,
      })),
    ...seed.listings
      .filter((listing) => matches(listing.title, listing.description))
      .map((listing) => ({
        id: listing.id,
        kind: 'Marketplace' as const,
        title: listing.title,
        subtitle: `$${listing.price} · ${listing.location}`,
        image: listing.image,
        href: `/marketplace/${listing.id}`,
      })),
    ...seed.events
      .filter((event) => matches(event.title, event.description))
      .map((event) => ({
        id: event.id,
        kind: 'Events' as const,
        title: event.title,
        subtitle: event.date,
        image: event.image,
        href: `/events?event=${event.id}`,
      })),
  ];
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(string);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const arrayOf = <T>(value: unknown, check: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(check);
const recordOf = (value: unknown, check: (item: unknown) => boolean): boolean =>
  object(value) &&
  Object.entries(value).every(
    ([key, item]) => !['__proto__', 'constructor', 'prototype'].includes(key) && check(item),
  );
function validSettings(value: unknown): value is Settings {
  return (
    object(value) &&
    ['light', 'dark'].includes(String(value.theme)) &&
    ['curated', 'recent'].includes(String(value.feedOrder)) &&
    audiences.includes(value.audience as Audience) &&
    object(value.notifications) &&
    ['friends', 'posts', 'marketplace', 'messages'].every(
      (key) => typeof (value.notifications as Record<string, unknown>)[key] === 'boolean',
    )
  );
}
function validProfile(value: unknown): value is Partial<ProfileEdits> {
  return (
    object(value) &&
    Object.entries(value).every(([key, item]) =>
      key === 'avatar' || key === 'cover'
        ? validMedia(item)
        : (key === 'bio' || key === 'location') && string(item) && item.length <= 500,
    )
  );
}
function validComment(value: unknown): value is Comment {
  return (
    object(value) &&
    string(value.id) &&
    string(value.authorId) &&
    knownPerson(value.authorId) &&
    string(value.text) &&
    value.text.length <= 2000 &&
    string(value.time)
  );
}
function validPost(value: unknown): value is Post {
  return (
    object(value) &&
    string(value.id) &&
    value.id.startsWith('local-post-') &&
    value.authorId === seed.viewerId &&
    string(value.text) &&
    value.text.trim().length > 0 &&
    value.text.length <= 5000 &&
    string(value.time) &&
    finite(value.createdAt) &&
    audiences.includes(value.audience as Audience) &&
    arrayOf(value.photos, validMedia) &&
    value.photos.length <= 1 &&
    !value.link &&
    finite(value.reactionCount) &&
    value.reactionCount === 0 &&
    arrayOf(value.comments, validComment)
  );
}
function validStory(value: unknown): value is Story {
  return (
    object(value) &&
    string(value.id) &&
    value.id.startsWith('local-story-') &&
    value.authorId === seed.viewerId &&
    validMedia(value.image) &&
    (value.text === undefined || (string(value.text) && value.text.length <= 500))
  );
}

export function encodeState(state: DemoState): string {
  const serialized = JSON.stringify(state);
  if (serialized.length > MAX_STORAGE_CHARS)
    throw new Error(
      'This demo’s local storage is full. Your changes are still visible in this session. Reset the demo to make space.',
    );
  return serialized;
}
export function decodeState(serialized: string | null): DemoState {
  if (serialized === null) return initialState();
  try {
    if (serialized.length > MAX_STORAGE_CHARS) throw new Error('oversize');
    const value: unknown = JSON.parse(serialized);
    if (
      !object(value) ||
      value.version !== 1 ||
      !Number.isSafeInteger(value.nextId) ||
      Number(value.nextId) < 1 ||
      !arrayOf(value.posts, validPost) ||
      !arrayOf(value.stories, validStory) ||
      !recordOf(value.comments, (item) => arrayOf(item, validComment)) ||
      !recordOf(value.reactions, (item) => reactions.includes(item as Reaction)) ||
      !strings(value.savedPostIds) ||
      !strings(value.savedListingIds) ||
      !recordOf(value.requestDecisions, (item) => item === 'confirmed' || item === 'deleted') ||
      !strings(value.sentRequestIds) ||
      !strings(value.readNotificationIds) ||
      !recordOf(value.messages, (item) => arrayOf(item, validComment)) ||
      !validSettings(value.settings) ||
      !validProfile(value.profile)
    )
      throw new Error('shape');
    const state = value as unknown as DemoState;
    const postIds = [...seed.posts, ...state.posts].map((post) => post.id);
    const idsUnique = (ids: string[]) => new Set(ids).size === ids.length;
    if (
      !idsUnique(postIds) ||
      !idsUnique([...seed.stories, ...state.stories].map((story) => story.id)) ||
      !Object.keys(state.comments).every((id) => postIds.includes(id)) ||
      !Object.keys(state.reactions).every((id) => postIds.includes(id)) ||
      !state.savedPostIds.every((id) => postIds.includes(id)) ||
      !state.savedListingIds.every((id) => seed.listings.some((listing) => listing.id === id)) ||
      !Object.keys(state.requestDecisions).every((id) =>
        seed.requests.some((request) => request.id === id),
      ) ||
      !state.sentRequestIds.every(knownPerson) ||
      !state.readNotificationIds.every((id) =>
        seed.notifications.some((notification) => notification.id === id),
      ) ||
      !Object.keys(state.messages).every(knownConversation)
    )
      throw new Error('references');
    const localIds = [
      ...state.posts,
      ...state.stories,
      ...Object.values(state.comments).flat(),
      ...Object.values(state.messages).flat(),
    ].map((item) => Number(item.id.split('-').at(-1)));
    if (
      localIds.some((id) => !Number.isSafeInteger(id) || id >= state.nextId || id < 1) ||
      !idsUnique(localIds.map(String))
    )
      throw new Error('sequence');
    return state;
  } catch {
    throw new Error(
      'Saved demo data could not be read. The original saved data is untouched; you can use this fresh session or reset the demo in Settings.',
    );
  }
}
