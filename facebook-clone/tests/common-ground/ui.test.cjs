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
  useLocalSearchParams: () => ({ planId: 'pl_nope' }),
  useFocusEffect: (cb) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker' }));
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

const store = require('../../src/features/common-ground/store');
const PlanScreen = require('../../src/features/common-ground/Plan').default;
const { Pill } = require('../../src/features/common-ground/ui');
const { Text } = require('react-native');

const texts = (tree) =>
  tree.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));

test('a plan the server 404s shows NotFound, not a blank page', async () => {
  await store.reset();
  await store.start();
  await store.optIn('city');
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(PlanScreen)); // loads pl_nope -> 404 on the mock
  });
  expect(store.getState().missingPlans.pl_nope).toBe(true);
  expect(texts(tree)).toContain("This plan isn't available");
  await renderer.act(async () => tree.unmount());
});

test('a display Pill reads as text; a tappable one as a selectable button', () => {
  let r;
  renderer.act(() => {
    r = renderer.create(
      React.createElement(React.Fragment, null, [
        React.createElement(Pill, { key: 1, label: 'Wheel throwing' }),
        React.createElement(Pill, { key: 2, label: 'Pottery', onPress: () => {}, selected: true }),
      ]),
    );
  });
  const show = r.root.findByProps({ accessibilityLabel: 'Wheel throwing' }).props;
  const tap = r.root.findByProps({ accessibilityLabel: 'Pottery' }).props;
  expect(show.accessibilityRole).toBe('text');
  expect([tap.accessibilityRole, tap.accessibilityState]).toEqual(['button', { selected: true }]);
});
