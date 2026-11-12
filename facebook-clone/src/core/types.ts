export type Audience = 'Public' | 'Friends' | 'Only me';
export type Reaction = 'Like' | 'Love' | 'Care' | 'Haha' | 'Wow' | 'Sad' | 'Angry';
export type NotificationCategory = 'friends' | 'posts' | 'marketplace' | 'messages';
export type MediaRef = string;
export interface Person {
  id: string;
  name: string;
  avatar: MediaRef;
  cover?: MediaRef;
  bio: string;
  location: string;
  online: boolean;
}
export interface Comment {
  id: string;
  authorId: string;
  text: string;
  time: string;
}
export interface Post {
  id: string;
  authorId: string;
  text: string;
  time: string;
  createdAt: number;
  audience: Audience;
  photos: MediaRef[];
  link?: { title: string; description: string; domain: string; image: MediaRef };
  reactionCount: number;
  comments: Comment[];
}
export interface Story {
  id: string;
  authorId: string;
  image: MediaRef;
  text?: string;
}
export interface FriendRequest {
  id: string;
  personId: string;
  mutual: number;
}
export interface Listing {
  id: string;
  sellerId: string;
  title: string;
  price: number;
  image: MediaRef;
  category: string;
  condition: string;
  location: string;
  description: string;
}
export interface DemoNotification {
  id: string;
  personId: string;
  category: NotificationCategory;
  text: string;
  time: string;
  href: string;
  read: boolean;
}
export interface Message {
  id: string;
  authorId: string;
  text: string;
  time: string;
}
export interface Conversation {
  id: string;
  personId: string;
  messages: Message[];
}
export interface DemoEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  image: MediaRef;
  location: string;
}
export interface DemoGroup {
  id: string;
  name: string;
  image: MediaRef;
  description: string;
  postIds: string[];
}
export interface Settings {
  theme: 'light' | 'dark';
  feedOrder: 'curated' | 'recent';
  audience: Audience;
  notifications: Record<NotificationCategory, boolean>;
}
export interface ProfileEdits {
  bio: string;
  location: string;
  avatar: MediaRef;
  cover: MediaRef;
}
export interface Seed {
  viewerId: string;
  people: Person[];
  posts: Post[];
  stories: Story[];
  contacts: string[];
  friendIds: string[];
  requests: FriendRequest[];
  suggestions: string[];
  notifications: DemoNotification[];
  listings: Listing[];
  conversations: Conversation[];
  events: DemoEvent[];
  groups: DemoGroup[];
  settings: Settings;
}
export interface DemoState {
  version: 1;
  nextId: number;
  posts: Post[];
  stories: Story[];
  comments: Record<string, Comment[]>;
  reactions: Record<string, Reaction>;
  savedPostIds: string[];
  savedListingIds: string[];
  requestDecisions: Record<string, 'confirmed' | 'deleted'>;
  sentRequestIds: string[];
  readNotificationIds: string[];
  messages: Record<string, Message[]>;
  settings: Settings;
  profile: Partial<ProfileEdits>;
}
export interface SearchResult {
  id: string;
  kind: 'People' | 'Posts' | 'Stories' | 'Marketplace' | 'Events';
  title: string;
  subtitle: string;
  image?: MediaRef;
  href: string;
}
export interface DemoActions {
  createPost(input: { text: string; photo?: MediaRef; audience: Audience }): string | null;
  createStory(input: { image: MediaRef; text?: string }): string;
  toggleReaction(postId: string, reaction: Reaction): void;
  addComment(postId: string, text: string): void;
  toggleSavedPost(postId: string): void;
  toggleSavedListing(listingId: string): void;
  decideRequest(requestId: string, decision: 'confirmed' | 'deleted'): void;
  requestFriend(personId: string): void;
  markNotificationRead(id: string): void;
  markAllNotificationsRead(): void;
  sendMessage(conversationId: string, text: string): void;
  updateSettings(patch: Partial<Settings>): void;
  updateProfile(patch: Partial<ProfileEdits>): void;
  reset(): Promise<void>;
}
export interface DemoContextValue {
  seed: Seed;
  state: DemoState;
  posts: Post[];
  stories: Story[];
  friends: Person[];
  requests: FriendRequest[];
  notifications: DemoNotification[];
  unreadCount: number;
  ready: boolean;
  error: string | null;
  actions: DemoActions;
  clearError(): void;
  person(id: string): Person;
  messages(conversationId: string): Message[];
  conversationFor(personId: string): string;
  search(query: string): SearchResult[];
}
