import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { seed } from '../src/data/seed';
import { mediaKeys } from '../src/data/mediaKeys';
import { createPersistence } from '../src/core/persistence';
import {
  decodeState,
  encodeState,
  friendIds,
  initialState,
  reduceDemo,
  searchContent,
  selectMessages,
  selectNotifications,
  selectPosts,
  selectPerson,
  STORAGE_KEY,
  validMedia,
} from '../src/core/model';

const newPost = {
  id: 'local-post-1',
  authorId: 'maya',
  text: 'Our new neighborhood project',
  time: 'Just now',
  createdAt: 1800000000000,
  audience: 'Friends' as const,
  photos: [],
  reactionCount: 0,
  comments: [],
};

test('seed counts, content variants, people and media references are fixed and complete', () => {
  assert.deepEqual(
    [
      seed.posts.length,
      seed.stories.length,
      seed.requests.length,
      seed.notifications.length,
      seed.listings.length,
      seed.conversations.length,
    ],
    [24, 8, 4, 6, 16, 3],
  );
  assert.ok(seed.contacts.length >= 8);
  assert.equal(seed.posts[0].id, 'post-01');
  assert.equal(seed.posts.filter((post) => post.authorId === seed.viewerId).length, 6);
  assert.equal(seed.events.length, 4);
  assert.equal(seed.groups.length, 3);
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(seed.posts.slice(0, 7)))
      .digest('hex'),
    'd61ce79b6ee2162da8e2e1f57fa05f1b3ca4813fbee87ff7146601cbb92c5934',
  );
  for (const collection of [seed.posts, seed.stories, seed.listings, seed.events, seed.groups]) {
    assert.equal(new Set(collection.map((item) => item.id)).size, collection.length);
  }
  const comments = seed.posts.flatMap((post) => post.comments);
  assert.equal(new Set(comments.map((comment) => comment.id)).size, comments.length);
  assert.ok(seed.posts.some((post) => post.photos.length === 3));
  assert.ok(seed.posts.some((post) => post.link));
  const people = new Set(seed.people.map((person) => person.id));
  assert.equal(people.size, seed.people.length);
  for (const item of [...seed.posts, ...seed.stories]) assert.ok(people.has(item.authorId));
  for (const item of [...seed.requests, ...seed.notifications, ...seed.conversations])
    assert.ok(people.has(item.personId));
  for (const listing of seed.listings) assert.ok(people.has(listing.sellerId));
  for (const group of seed.groups)
    assert.ok(group.postIds.every((id) => seed.posts.some((post) => post.id === id)));
  const media = [
    ...seed.people.flatMap((person) => [person.avatar, person.cover].filter(Boolean)),
    ...seed.posts.flatMap((post) => [...post.photos, post.link?.image].filter(Boolean)),
    ...seed.stories.map((story) => story.image),
    ...seed.listings.map((listing) => listing.image),
    ...seed.events.map((event) => event.image),
    ...seed.groups.map((group) => group.image),
  ];
  for (const key of media) assert.ok((mediaKeys as readonly unknown[]).includes(key), String(key));
  assert.deepEqual(decodeState(null), initialState());
  assert.deepEqual(decodeState(encodeState(initialState())), initialState());
});

test('post, comment, reaction and save changes roundtrip without mutating seed', () => {
  let state = reduceDemo(initialState(), { type: 'post', post: newPost });
  state = reduceDemo(state, {
    type: 'comment',
    postId: newPost.id,
    comment: { id: 'local-comment-2', authorId: 'maya', text: 'More soon!', time: 'Just now' },
  });
  state = reduceDemo(state, { type: 'reaction', postId: newPost.id, reaction: 'Love' });
  state = reduceDemo(state, { type: 'savePost', postId: newPost.id });
  state = decodeState(encodeState(state));
  assert.equal(selectPosts(state)[0].comments[0].text, 'More soon!');
  assert.equal(selectPosts(state)[0].reactionCount, 1);
  assert.deepEqual(state.savedPostIds, [newPost.id]);
  state = reduceDemo(state, { type: 'reaction', postId: newPost.id, reaction: 'Love' });
  assert.equal(selectPosts(state)[0].reactionCount, 0);
  state = reduceDemo(state, { type: 'savePost', postId: newPost.id });
  assert.deepEqual(state.savedPostIds, []);
  assert.equal(seed.posts.length, 24);
  assert.equal(seed.posts[0].reactionCount, 128);
});

test('request decisions update friends once and preserve unrelated requests', () => {
  let state = reduceDemo(initialState(), {
    type: 'request',
    requestId: 'request-nora',
    decision: 'confirmed',
  });
  state = reduceDemo(state, { type: 'request', requestId: 'request-kai', decision: 'deleted' });
  state = decodeState(encodeState(state));
  assert.ok(friendIds(state).includes('nora'));
  assert.ok(!friendIds(state).includes('kai'));
  assert.equal(friendIds(state).length, seed.friendIds.length + 1);
  assert.equal(state.requestDecisions['request-lucas'], undefined);
  assert.equal(
    reduceDemo(state, { type: 'request', requestId: 'request-nora', decision: 'deleted' }),
    state,
  );
});

test('notification filters retain read state and feed settings visibly reorder', () => {
  let state = initialState();
  assert.equal(selectNotifications(state).filter((item) => !item.read).length, 4);
  state = reduceDemo(state, { type: 'read', ids: ['notification-01'] });
  state = reduceDemo(state, {
    type: 'settings',
    patch: {
      feedOrder: 'recent',
      theme: 'dark',
      audience: 'Only me',
      notifications: { ...state.settings.notifications, posts: false },
    },
  });
  assert.equal(selectNotifications(state).length, 3);
  assert.equal(selectPosts(state)[0].id, 'post-02');
  state = reduceDemo(state, {
    type: 'settings',
    patch: { notifications: { ...state.settings.notifications, posts: true } },
  });
  assert.equal(
    selectNotifications(state).find((item) => item.id === 'notification-01')?.read,
    true,
  );
  assert.equal(decodeState(encodeState(state)).settings.theme, 'dark');
  assert.equal(initialState().settings.theme, 'light');
});

test('messages, saved listings and profile edits persist in the same overlay', () => {
  let state = reduceDemo(initialState(), {
    type: 'message',
    conversationId: 'chat-sofia',
    message: {
      id: 'local-message-1',
      authorId: 'maya',
      text: 'Is the bike still available?',
      time: '12:00 PM',
    },
  });
  state = reduceDemo(state, { type: 'saveListing', listingId: 'listing-bike' });
  state = reduceDemo(state, {
    type: 'profile',
    patch: { bio: 'A fresh idea.', location: 'The neighborhood' },
  });
  state = decodeState(encodeState(state));
  assert.equal(selectMessages(state, 'chat-sofia').length, 1);
  assert.equal(selectMessages(state, 'chat-leo').length, 3);
  assert.deepEqual(state.savedListingIds, ['listing-bike']);
  assert.equal(selectPerson(state, 'maya').bio, 'A fresh idea.');
  assert.notEqual(seed.people[0].bio, 'A fresh idea.');
});

test('search is case insensitive and includes people, user posts, stories, listings and events', () => {
  const state = reduceDemo(initialState(), { type: 'post', post: newPost });
  assert.ok(searchContent(state, 'MAYA').some((result) => result.kind === 'People'));
  assert.ok(searchContent(state, 'maya').some((result) => result.kind === 'Stories'));
  assert.ok(
    searchContent(state, 'neighborhood project').some((result) => result.id === newPost.id),
  );
  assert.ok(
    searchContent(state, 'city BIKE').some((result) => result.href === '/marketplace/listing-bike'),
  );
  assert.ok(searchContent(state, 'book swap').some((result) => result.kind === 'Events'));
  assert.deepEqual(searchContent(state, 'nothing-matches-this'), []);
  assert.deepEqual(searchContent(state, '  '), []);
});

test('corrupt saved data, remote media and invalid IDs are rejected', () => {
  const state = initialState();
  assert.equal(reduceDemo(state, { type: 'post', post: { ...newPost, text: ' ' } }), state);
  assert.equal(reduceDemo(state, { type: 'reaction', postId: 'missing', reaction: 'Like' }), state);
  assert.equal(validMedia('https://example.com/photo.jpg'), false);
  assert.equal(validMedia('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(validMedia('file:///etc/passwd'), false);
  for (const invalid of [
    'not json',
    '{"version":1}',
    JSON.stringify({ ...state, savedPostIds: ['missing'] }),
    JSON.stringify({ ...state, settings: { ...state.settings, theme: 'unknown' } }),
    JSON.stringify({
      ...state,
      posts: [{ ...newPost, photos: ['https://example.com/image.jpg'] }],
    }),
    JSON.stringify({ ...state, posts: [newPost], nextId: 1 }),
  ])
    assert.throws(() => decodeState(invalid), /could not be read/);
  assert.throws(
    () => encodeState({ ...state, profile: { bio: 'x'.repeat(3_500_001) } }),
    /storage is full/,
  );
});

test('write serialization and reset preserve order; write failures are surfaced', async () => {
  const order: string[] = [];
  let finishFirst: (() => void) | undefined;
  let writes = 0;
  const errors: string[] = [];
  const persistence = createPersistence(
    {
      async read() {
        return null;
      },
      async write(value) {
        const index = ++writes;
        order.push(`start-${index}`);
        if (index === 1)
          await new Promise<void>((resolve) => {
            finishFirst = resolve;
          });
        assert.equal(JSON.parse(value).version, 1);
        order.push(`end-${index}`);
        if (index === 2) throw new Error('quota');
      },
      async remove() {
        order.push('reset');
      },
    },
    (error) => errors.push(error),
  );
  persistence.save(initialState());
  persistence.save({ ...initialState(), nextId: 2 });
  await Promise.resolve();
  assert.deepEqual(order, ['start-1']);
  const reset = persistence.reset();
  finishFirst?.();
  await reset;
  assert.deepEqual(order, ['start-1', 'end-1', 'start-2', 'end-2', 'reset']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /remain visible/);
});

test('browser reset removes only the demo key', async () => {
  const entries = new Map([
    [STORAGE_KEY, 'demo'],
    ['another-app', 'keep me'],
  ]);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
        removeItem: (key: string) => entries.delete(key),
      },
    },
  });
  try {
    const { storage } = await import('../src/platform/storage.web');
    assert.equal(await storage.read(), 'demo');
    await storage.remove();
    assert.equal(entries.has(STORAGE_KEY), false);
    assert.equal(entries.get('another-app'), 'keep me');
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('failed hydration preserves original data across edits until an explicit successful reset', async () => {
  const original = '{this data cannot be read';
  let stored: string | null = original;
  let rejectReset = true;
  const errors: string[] = [];
  const persistence = createPersistence(
    {
      async read() {
        return stored;
      },
      async write(value) {
        stored = value;
      },
      async remove() {
        if (rejectReset) throw new Error('storage unavailable');
        stored = null;
      },
    },
    (error) => errors.push(error),
  );
  await assert.rejects(persistence.load(), /will not be saved until you reset/);
  persistence.save(reduceDemo(initialState(), { type: 'post', post: newPost }));
  await persistence.flush();
  assert.equal(stored, original);
  assert.match(errors[0], /session only/);
  await assert.rejects(persistence.reset());
  persistence.save(initialState());
  await persistence.flush();
  assert.equal(stored, original);
  rejectReset = false;
  await persistence.reset();
  persistence.save(initialState());
  await persistence.flush();
  assert.deepEqual(decodeState(stored), initialState());
});

test('owned photo collection retains post, story, avatar and cover files without duplicate or bundled assets', async () => {
  const { ownedPhotoRefs } = await import('../src/core/model');
  const first = 'file:///app/Documents/facebook-clone-demo/photos/photo-1.jpg';
  const second = 'file:///app/Documents/facebook-clone-demo/photos/photo-2.jpg';
  const third = 'file:///app/Documents/facebook-clone-demo/photos/photo-3.jpg';
  const state = {
    ...initialState(),
    posts: [{ ...newPost, photos: [first] }],
    stories: [{ id: 'local-story-2', authorId: 'maya', image: second }],
    profile: { avatar: first, cover: third },
  };
  assert.deepEqual(ownedPhotoRefs(state), [first, second, third]);
  assert.deepEqual(ownedPhotoRefs(initialState()), []);
});

test('expanded content is searchable beyond the original first screen', () => {
  const state = initialState();
  assert.ok(
    searchContent(state, 'neighborhood brunch').some((result) => result.href === '/posts/post-24'),
  );
  assert.ok(
    searchContent(state, 'Desktop keyboard').some(
      (result) => result.href === '/marketplace/listing-keyboard',
    ),
  );
  assert.ok(searchContent(state, 'golden hour').some((result) => result.id === 'event-photo-walk'));
  assert.ok(
    searchContent(state, 'afternoon light').some(
      (result) => result.href === '/stories/story-sofia',
    ),
  );
});

test('previous version-one edits remain intact when the immutable seed expands', () => {
  const previousOverlay = {
    ...initialState(),
    nextId: 2,
    posts: [newPost],
    reactions: { 'post-01': 'Love' },
    savedPostIds: ['post-07'],
    savedListingIds: ['listing-camera'],
    requestDecisions: { 'request-nora': 'confirmed' },
    readNotificationIds: ['notification-01'],
    settings: { ...initialState().settings, theme: 'dark' },
    profile: { bio: 'My existing demo profile' },
  };
  const restored = decodeState(JSON.stringify(previousOverlay));
  assert.deepEqual(restored, previousOverlay);
  assert.equal(STORAGE_KEY, 'facebook-clone-demo:v1');
  assert.equal(selectPosts(restored).length, 25);
  assert.equal(selectPosts(restored)[0].id, newPost.id);
  assert.equal(selectPosts(restored).find((post) => post.id === 'post-01')?.reactionCount, 129);
  assert.ok(selectPosts(restored).some((post) => post.id === 'post-24'));
  assert.ok(friendIds(restored).includes('nora'));
});

test('bundled media files exist and all photo provenance hashes match the frozen bytes', () => {
  const module = readFileSync('src/data/media.ts', 'utf8');
  const references = [...module.matchAll(/require\('([^']+)'\)/g)];
  for (const reference of references) {
    assert.ok(existsSync(path.resolve('src/data', reference[1])), reference[1]);
  }
  const ledger = readFileSync('assets/provenance.md', 'utf8');
  const photos = [...ledger.matchAll(/\| `(images\/[^`]+\.jpg)` \| .*? \| `([a-f0-9]{64})` \|/g)];
  assert.equal(photos.length, 49);
  for (const [, filename, hash] of photos) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(path.join('assets', filename)))
        .digest('hex'),
      hash,
      filename,
    );
  }
});
