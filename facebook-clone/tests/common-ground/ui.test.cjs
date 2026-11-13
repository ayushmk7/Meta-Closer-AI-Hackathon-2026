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

const { Pill } = require('../../src/features/common-ground/ui');

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
