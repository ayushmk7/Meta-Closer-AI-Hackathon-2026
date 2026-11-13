/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockParams = { meetupId: 'mt_0001' };
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
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  FadeInDown: {},
}));
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

const store = require('../../src/features/common-ground/store');

beforeAll(async () => {
  await store.reset();
  await store.start();
});
const mounted = [];
afterEach(async () => {
  await renderer.act(async () => mounted.splice(0).forEach((t) => t.unmount()));
  jest.restoreAllMocks();
  store.setState({ error: null });
});

async function render(element) {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(element);
  });
  mounted.push(tree);
  const text = () => JSON.stringify(tree.toJSON());
  const byLabel = (label) =>
    tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.type !== 'string')[0];
  const press = async (label) => {
    const node = tree.root.find(
      (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
    );
    await renderer.act(async () => node.props.onPress());
  };
  return { tree, text, byLabel, press };
}

const FeedbackExtras = require('../../src/features/common-ground/FeedbackExtras').default;

function Harness({ start = {}, seen }) {
  const [value, setValue] = React.useState(start);
  seen.current = value;
  return React.createElement(FeedbackExtras, { value, onChange: setValue });
}

test('stars set, change and clear the rating', async () => {
  const seen = {};
  const { press, byLabel } = await render(React.createElement(Harness, { seen }));
  await press('4 stars');
  expect(seen.current.rating).toBe(4);
  expect(byLabel('4 stars').props.accessibilityState.checked).toBe(true);
  await press('1 star');
  expect(seen.current.rating).toBe(1);
  await press('1 star');
  expect(seen.current.rating).toBeUndefined();
});

test('tags toggle and keep unknown tags already in the value', async () => {
  const seen = {};
  const { press, byLabel } = await render(
    React.createElement(Harness, { seen, start: { tags: ['from_the_future'] } }),
  );
  await press('Too far');
  await press('Good group');
  expect(seen.current.tags).toEqual(['from_the_future', 'too_far', 'good_group']);
  expect(byLabel('Too far').props.accessibilityState.selected).toBe(true);
  await press('Too far');
  expect(seen.current.tags).toEqual(['from_the_future', 'good_group']);
});
