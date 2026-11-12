/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockDemo = { state: { settings: { theme: 'light' } } };
jest.mock('../../src/core/store', () => ({ useDemo: () => mockDemo }));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (fn) => require('react').useEffect(fn, [fn]),
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
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView' }));
jest.mock('../../src/platform/scopedStorage', () => {
  let saved = null;
  const adapter = {
    read: async () => saved,
    write: async (v) => void (saved = v),
    remove: async () => void (saved = null),
  };
  return { createScopedStorage: () => adapter };
});
const { DropCard } = require('../../src/features/common-ground/People');
const store = require('../../src/features/common-ground/store');

const interest = (id) => ({ id, label: `Label ${id}`, path: ['Outdoors', id], level: 2 });
const card = (patch = {}) => ({
  suggestionId: 'sg_test',
  person: {
    userId: 'u_1',
    displayName: 'Daniel Okafor',
    initials: 'DO',
    avatarUrl: null,
    profileVisibility: 'public',
  },
  distanceBand: '1_3km',
  sharedInterests: ['a', 'b', 'c', 'd'].map(interest),
  reason: 'You both hike.',
  state: 'open',
  hiAvailable: true,
  ...patch,
});
const render = async (c) => {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(DropCard, { card: c }));
  });
  return tree;
};
const labels = (tree) =>
  tree.root
    .findAll((n) => n.props.accessibilityRole === 'button')
    .map((n) => n.props.accessibilityLabel);

beforeAll(async () => {
  await store.reset();
  await store.start();
});

test('public card shows the name, at most three chips and Connect / Pass / Say hi', async () => {
  const tree = await render(card());
  const text = JSON.stringify(tree.toJSON());
  expect(text).toContain('Daniel Okafor');
  expect(text).toContain('Label c');
  expect(text).not.toContain('Label d');
  expect(labels(tree)).toEqual(
    expect.arrayContaining([
      'Connect with Daniel Okafor',
      'Pass on Daniel Okafor',
      'Say hi to Daniel Okafor',
    ]),
  );
});

test('private card shows Someone nearby and no name', async () => {
  const tree = await render(
    card({
      person: {
        userId: 'u_2',
        displayName: null,
        initials: 'R',
        avatarUrl: null,
        profileVisibility: 'private',
      },
    }),
  );
  const text = JSON.stringify(tree.toJSON());
  expect(text).toContain('Someone nearby');
  expect(text).not.toContain('Daniel');
});

test('connect_sent shows Connect sent and no buttons', async () => {
  const tree = await render(card({ state: 'connect_sent' }));
  expect(JSON.stringify(tree.toJSON())).toContain('Connect sent');
  expect(labels(tree)).toEqual([]);
});

test.each(['passed', 'expired', 'mystery'])('%s renders null', async (state) => {
  const tree = await render(card({ state }));
  expect(tree.toJSON()).toBeNull();
});

test('Finder runs intro, onboarding, review and connects on the mock', async () => {
  const Finder = require('../../src/features/common-ground/Finder').default;
  const { router } = require('expo-router');
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(Finder, { onClose: jest.fn() }));
  });
  const text = () => JSON.stringify(tree.toJSON());
  const press = async (label) => {
    const node = tree.root.find(
      (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
    );
    await renderer.act(async () => node.props.onPress());
  };
  expect(text()).toContain('People only ever see what you have in common.');
  await press('Continue');
  expect(text()).toContain('What else do you love doing');
  for (const msg of ['Climbing', 'Board games', 'Weekends']) {
    const input = tree.root.find(
      (n) => n.props.accessibilityLabel === 'Message Muse' && n.props.onChangeText,
    );
    await renderer.act(async () => input.props.onChangeText(msg));
    await press('Send message');
  }
  expect(text()).toContain('Only you can see this.');
  await press('Looks good');
  expect(text()).toContain("Today's people");
  expect(text()).toContain('Waiting for you');
  await press('Connect with Marcus Hale');
  expect(text()).toContain('Connect sent');
  await press('Connect with Daniel Okafor');
  expect(text()).toContain('both said yes');
  await press('Say hello');
  expect(router.push).toHaveBeenCalledWith('/common-ground/chat/th_0001');
  await renderer.act(async () => tree.unmount());
});
