/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockMaya = { id: 'maya', name: 'Maya Chen', avatar: 'maya', online: true };
const mockDemo = {
  state: { settings: { theme: 'light' } },
  seed: { viewerId: 'maya', people: [mockMaya] },
  person: () => mockMaya,
};
jest.mock('../../src/core/store', () => ({ useDemo: () => mockDemo }));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-haptics', () => ({}));
jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: 'MapView',
  Marker: 'Marker',
  Circle: 'Circle',
  Polygon: 'Polygon',
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

const { api } = require('../../src/features/common-ground/api');
const store = require('../../src/features/common-ground/store');
const FriendSheet = require('../../src/features/common-ground/FriendSheet').default;
const { Button } = require('../../src/ui/native');

const titles = (tree) => tree.root.findAllByType(Button).map((b) => b.props.title);

test('friend sheet shows name, shared interests, precision chips and Meet up; hides View profile when not allowed', async () => {
  await store.reset();
  await store.start();
  await api.optIn('city');
  await store.load.me();
  await store.refreshAll();
  await store.decide('sg_0001', 'connect');

  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(FriendSheet, { userId: 'u_0042', onClose() {} }));
  });
  const text = JSON.stringify(tree.toJSON());
  expect(text).toContain('Daniel Okafor');
  const connection = store.getState().connections.find((x) => x.person.userId === 'u_0042');
  for (const i of connection.sharedInterests) expect(text).toContain(i.label);
  for (const chip of ['Off', 'Neighborhood', 'Exact', 'Share my location', 'How I see them'])
    expect(text).toContain(chip);
  expect(titles(tree)).toEqual(expect.arrayContaining(['Meet up', 'View profile', 'Block']));

  await renderer.act(async () =>
    store.setState({
      connections: store
        .getState()
        .connections.map((x) => (x === connection ? { ...x, canViewProfile: false } : x)),
    }),
  );
  expect(titles(tree)).not.toContain('View profile');
  await renderer.act(async () => tree.unmount());
});
