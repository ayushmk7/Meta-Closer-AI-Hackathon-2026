/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../src/core/store', () => ({
  useDemo: () => ({ state: { settings: { theme: 'light' } } }),
}));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: {},
}));
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

const fixtures = require('../../src/features/common-ground/fixtures.json');
const { api, CgError } = require('../../src/features/common-ground/api');
const store = require('../../src/features/common-ground/store');
const SetupScreen = require('../../src/features/common-ground/Setup').default;

beforeAll(async () => {
  await store.reset();
  await store.start();
});
const mounted = [];
afterEach(async () => {
  jest.restoreAllMocks();
  await renderer.act(async () => mounted.splice(0).forEach((t) => t.unmount()));
  store.setState({ error: null });
});

async function render(el) {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(el);
  });
  mounted.push(tree);
  // Host props can hold elements (refreshControl), so collect strings instead of JSON.stringify.
  const text = () =>
    JSON.stringify(
      tree.root
        .findAll((n) => typeof n.type === 'string')
        .flatMap((n) => [n.props.accessibilityLabel, n.props.placeholder, n.props.children])
        .flat()
        .filter((x) => typeof x === 'string' || typeof x === 'number'),
    );
  const find = (pred) => tree.root.find((n) => typeof n.type === 'string' && pred(n.props));
  const press = async (label) => {
    const node = tree.root.find(
      (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
    );
    await renderer.act(async () => node.props.onPress());
  };
  const has = (label) =>
    tree.root.findAll((n) => n.props.accessibilityLabel === label && n.props.onPress).length > 0;
  return { tree, text, find, press, has };
}
const { Alert } = require('react-native');
// Press the Alert button titled `text` the next time Alert.alert is called.
const confirmWith = (text) =>
  jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_t, _m, buttons) => buttons.find((b) => b.text === text)?.onPress?.());

test('intro -> optIn -> connect apps -> picked up (locked sensitive) -> done', async () => {
  const { router } = require('expo-router');
  const complete = jest.spyOn(api, 'completeSetup');
  const { text, press } = await render(React.createElement(SetupScreen));
  expect(text()).toContain('People only see what you have in common');
  expect(text()).toContain('Campus, coming soon');
  await press('Continue');
  expect(store.getState().me.optedIn).toBe(true);
  expect(text()).toContain('Connect your apps');
  expect(text()).toContain('Demo data');
  await press('Skip for now');
  expect(text()).toContain('What Muse picked up');
  expect(text()).toContain('Only you can see this.');
  await press('Remove Wheel throwing');
  await press('Continue');
  expect(text()).toContain('Group size');
  expect(text()).not.toContain("When you're usually free"); // calendar is connected
  await press('Done');
  expect(complete).toHaveBeenCalledWith(
    expect.objectContaining({
      acceptedInterestIds: ['outdoors.hiking.coastal_hikes'],
      hiddenInterestIds: ['identity_values.faith.buddhism'],
      profileVisibility: fixtures.getMe.profileVisibility,
    }),
  );
  expect(store.getState().me.setupComplete).toBe(true);
  expect(router.replace).toHaveBeenCalledWith('/common-ground');
});

test('Back returns to the previous page', async () => {
  const { text, press } = await render(React.createElement(SetupScreen));
  expect(text()).toContain('Connect your apps'); // opted in: starts at connectors
  await press('Continue');
  expect(text()).toContain('What Muse picked up');
  await press('Back');
  expect(text()).toContain('Connect your apps');
});
