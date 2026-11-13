/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
let mockPath = '/common-ground/welcome';
const mockBadge = jest.fn(() => 0);
jest.mock('../../src/core/store', () => ({
  useDemo: () => ({ ready: false, state: { settings: { theme: 'light' } } }),
}));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
jest.mock('../../src/extensions/registry', () => ({
  tabs: [
    {
      href: '/common-ground',
      label: 'Plans',
      icon: 'a',
      activeIcon: 'b',
      after: '/friends',
      useBadge: mockBadge,
    },
  ],
}));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() }, usePathname: () => mockPath }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
const Shell = require('../../src/ui/Shell').default;

test('logged-out Welcome renders without tab chrome or badge hooks; other routes call them', () => {
  let tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(Shell, null, 'welcome'));
  });
  expect(mockBadge).not.toHaveBeenCalled();
  mockPath = '/';
  renderer.act(() => tree.update(React.createElement(Shell, null, 'home')));
  expect(mockBadge).toHaveBeenCalled();
});
