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
const { api } = require('../../src/features/common-ground/api');
const store = require('../../src/features/common-ground/store');
const SettingsScreen = require('../../src/features/common-ground/Settings').default;

beforeAll(async () => {
  await store.reset();
  await store.start();
  await store.optIn('city');
  store.setState({ me: { ...store.getState().me, setupComplete: true } });
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

test('Muse permissions only with features.autonomySettings, saved with updateMe', async () => {
  const update = jest.spyOn(api, 'updateMe');
  const r1 = await render(React.createElement(SettingsScreen));
  expect(r1.text()).not.toContain('What Muse can do without asking');
  const config = store.getState().config;
  await renderer.act(async () =>
    store.setState({
      config: { ...config, features: { ...config.features, autonomySettings: true } },
    }),
  );
  const r2 = await render(React.createElement(SettingsScreen));
  expect(r2.text()).toContain('What Muse can do without asking');
  const toggle = r2.tree.root.find(
    ({ props: p }) => p.accessibilityLabel === 'Reschedule when plans change' && p.onValueChange,
  );
  await renderer.act(async () => toggle.props.onValueChange(false));
  expect(update).toHaveBeenCalledWith({
    museSettings: expect.objectContaining({ autoReschedule: false }),
  });
});

test('sensitive signals show locked with their label only', async () => {
  const { text } = await render(React.createElement(SettingsScreen));
  const sensitive = fixtures.getSetup.signals.find((s) => s.sensitive);
  expect(text()).toContain(sensitive.label);
  expect(text()).toContain('Only you can see this');
});

test('Leave Common Ground confirms first, then opts out', async () => {
  const optOut = jest.spyOn(api, 'optOut');
  const { press } = await render(React.createElement(SettingsScreen));
  confirmWith('Cancel');
  await press('Leave Common Ground');
  expect(optOut).not.toHaveBeenCalled();
  confirmWith('Leave');
  await press('Leave Common Ground');
  await renderer.act(async () => {});
  expect(optOut).toHaveBeenCalled();
  expect(store.getState().me.optedIn).toBe(false);
});

test('a spend limit outside the chip values shows as its own selected chip, not $0', async () => {
  const config = store.getState().config;
  const me = store.getState().me;
  await renderer.act(async () =>
    store.setState({
      config: { ...config, features: { ...config.features, autonomySettings: true } },
      me: {
        ...me,
        optedIn: true, // the Leave test above opted out
        museSettings: { ...me.museSettings, spendWithoutAskingCents: 1500 },
      },
    }),
  );
  jest.spyOn(api, 'getMe').mockResolvedValue(store.getState().me);
  const { tree } = await render(React.createElement(SettingsScreen));
  const selected = tree.root
    .findAll((n) => typeof n.type === 'string' && n.props.accessibilityState?.selected)
    .map((n) =>
      JSON.stringify(
        n.findAll((x) => typeof x.props.children === 'string').map((x) => x.props.children),
      ),
    );
  expect(selected.some((t) => t.includes('$15'))).toBe(true);
  expect(selected.some((t) => t.includes('"$0"'))).toBe(false);
});

test('not opted in: setup prompt instead of settings (no 403 banner)', async () => {
  jest.spyOn(api, 'getMe').mockResolvedValue({ ...store.getState().me, optedIn: false });
  await renderer.act(async () =>
    store.setState({ me: { ...store.getState().me, optedIn: false }, error: null }),
  );
  const { text } = await render(React.createElement(SettingsScreen));
  expect(text()).toContain('Get started');
  expect(text()).not.toContain('Group size');
  expect(store.getState().error).toBeNull();
});

test('signal rows show the connector label, not the provider id', async () => {
  const { SignalRow } = require('../../src/features/common-ground/Settings');
  const signal = fixtures.getSetup.signals.find((s) => !s.sensitive);
  await renderer.act(async () =>
    store.setState({ connectors: [{ provider: signal.provider, label: 'Google Maps' }] }),
  );
  const { text } = await render(React.createElement(SignalRow, { signal }));
  expect(text()).toContain('Google Maps');
  expect(text()).not.toContain(signal.provider);
});
