/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
let mockPath = '/common-ground/welcome';
const mockBadge = jest.fn(() => 0);
let mockReady = false;
jest.mock('../../src/core/store', () => ({
  useDemo: () => ({
    ready: mockReady,
    state: { settings: { theme: 'light' } },
    seed: { viewerId: 'u' },
    person: () => ({ avatar: 'a' }),
    unreadCount: 0,
  }),
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
      headerAction: { icon: 'settings-outline', label: 'Plans settings', href: '/x' },
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

test('a contributed tab root titles the top bar and shows its header action; Home does not', () => {
  mockReady = true;
  mockPath = '/common-ground';
  let tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(Shell, null, 'plans'));
  });
  const has = (label) => tree.root.findAll((n) => n.props.accessibilityLabel === label).length > 0;
  const header = () =>
    tree.root.findAll(
      (n) => n.props.accessibilityRole === 'header' && n.props.children === 'Plans',
    );
  expect(header().length).toBeGreaterThan(0);
  expect(has('Plans settings')).toBe(true);
  mockPath = '/';
  renderer.act(() => tree.update(React.createElement(Shell, null, 'home')));
  expect(has('Plans settings')).toBe(false);
  expect(header()).toHaveLength(0);
});
