/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockPost = jest.fn();
jest.mock('../../src/extensions/story', () => ({ usePostStory: () => mockPost }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 1, longitude: 2 } })),
}));
jest.mock('../../src/core/store', () => ({
  useDemo: () => ({ state: { settings: { theme: 'light' } } }),
}));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('react-native-reanimated', () => require('./reanimated.cjs'));
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker' }));
jest.mock('../../src/platform/scopedStorage', () => {
  let saved = null;
  return {
    createScopedStorage: () => ({
      read: async () => saved,
      write: async (v) => void (saved = v),
      remove: async () => void (saved = null),
    }),
  };
});

const F = require('../../src/features/common-ground/fixtures.json');
const store = require('../../src/features/common-ground/store');
const StoryPrompt = require('../../src/features/common-ground/StoryPrompt').default;
const Haptics = require('expo-haptics');

beforeAll(async () => {
  await store.reset();
  await store.start();
});
const mounted = [];
afterEach(async () => {
  await renderer.act(async () => mounted.splice(0).forEach((t) => t.unmount()));
  mockPost.mockReset();
});
const done = (over = {}) => ({ ...F.getMeetup, status: 'completed', feedbackDue: false, ...over });
async function render(m) {
  let tree;
  await renderer.act(
    async () => void (tree = renderer.create(React.createElement(StoryPrompt, { m }))),
  );
  mounted.push(tree);
  const text = () => JSON.stringify(tree.toJSON());
  const press = async (label) => {
    const node = tree.root.find(
      (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
    );
    await renderer.act(async () => node.props.onPress());
  };
  return { tree, text, press };
}

test('hidden unless completed, I went and the venue has a photo', async () => {
  for (const m of [
    { ...F.getMeetup, status: 'confirmed' },
    done({ venue: { ...F.getMeetup.venue, photoUrl: null } }),
    done({
      attendees: F.getMeetup.attendees.map((a) => (a.isMe ? { ...a, rsvp: 'not_going' } : a)),
    }),
  ])
    expect((await render(m)).tree.toJSON()).toBeNull();
  expect((await render(done())).text()).toContain('Add to your story');
});

test('one tap posts the venue photo and plan title only, then remembers it', async () => {
  const m = done({ meetupId: 'mt_story_post' });
  mockPost.mockResolvedValueOnce(null).mockResolvedValueOnce('local-story-9');
  const { text, press } = await render(m);
  await press('Share to story');
  expect(text()).toContain("Couldn't add it to your story. Try again.");
  await press('Share to story');
  expect(mockPost).toHaveBeenLastCalledWith({ image: m.venue.photoUrl, text: m.title });
  const names = m.attendees.filter((a) => !a.isMe).map((a) => a.person.displayName);
  expect(names.some((n) => JSON.stringify(mockPost.mock.calls).includes(n))).toBe(false);
  expect(Haptics.notificationAsync).toHaveBeenCalled();
  expect(text()).toContain('Added to your story');
  expect(store.getState().storyPrompt[m.meetupId]).toBe('posted');
  expect((await render(m)).tree.toJSON()).toBeNull();
});

test('Not now dismisses for good; the mock asset key is passed without its prefix', async () => {
  const m = done({
    meetupId: 'mt_story_x',
    venue: { ...F.getMeetup.venue, photoUrl: 'asset:pottery' },
  });
  const a = await render(m);
  await a.press('Not now');
  expect(a.tree.toJSON()).toBeNull();
  expect(store.getState().storyPrompt[m.meetupId]).toBe('dismissed');
  expect((await render(m)).tree.toJSON()).toBeNull();
  const b = await render({ ...m, meetupId: 'mt_story_y' });
  mockPost.mockResolvedValueOnce('s1');
  await b.press('Share to story');
  expect(mockPost).toHaveBeenCalledWith({ image: 'pottery', text: m.title });
});

test('the share button steps back to secondary while feedback is due', async () => {
  const { tree } = await render(done({ meetupId: 'mt_story_fb', feedbackDue: true }));
  const btn = tree.root.find((n) => n.props.title === 'Share to story');
  expect(btn.props.secondary).toBe(true);
});
