/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('expo-linking', () => ({ createURL: (p) => `app://${p}` }));
jest.mock('../../src/core/store', () => ({
  useDemo: () => ({ state: { settings: { theme: 'light' } } }),
}));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
const mockParams = {};
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-reanimated', () => require('./reanimated.cjs'));
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

const fixtures = require('../../src/features/common-ground/fixtures.json');
const { api } = require('../../src/features/common-ground/api');
const store = require('../../src/features/common-ground/store');
const PublicPlan = require('../../src/features/common-ground/PublicPlan').default;
const { timeRange } = require('../../src/features/common-ground/PublicPlan');
const PlanScreen = require('../../src/features/common-ground/Plan').default;
const ShareCard = require('../../src/features/common-ground/ShareCard').default;
const WelcomeScreen = require('../../src/features/common-ground/Welcome').default;
const { Share } = require('react-native');

beforeAll(async () => {
  await store.reset();
  await store.start();
  await store.optIn('city');
  await store.load.shares();
});
const mounted = [];
afterEach(async () => {
  jest.restoreAllMocks();
  await renderer.act(async () => mounted.splice(0).forEach((t) => t.unmount()));
  for (const k of Object.keys(mockParams)) delete mockParams[k];
});
async function render(el) {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(el);
  });
  mounted.push(tree);
  const text = () =>
    tree.root
      .findAll((n) => typeof n.type === 'string')
      .flatMap((n) => [n.props.accessibilityLabel, n.props.children])
      .flat()
      .filter((x) => typeof x === 'string')
      .join('|');
  const press = async (label) => {
    const node = tree.root.find(
      (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
    );
    await renderer.act(async () => node.props.onPress());
  };
  const has = (label) => tree.root.findAll((n) => n.props.accessibilityLabel === label).length > 0;
  return { text, press, has };
}
const sharingOff = () =>
  store.setState({ config: { ...store.getState().config, features: { sharing: false } } });
const sharingOn = () =>
  store.setState({ config: { ...store.getState().config, features: { sharing: true } } });
const people = [
  ...fixtures.listConnections.items.flatMap((c) => [c.person.displayName, c.person.userId]),
  fixtures.getMe.displayName,
  fixtures.getMe.userId,
].filter(Boolean);
const shareSpy = () => jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

test("public plan page: title, date line and count line, no people, no I'm in", async () => {
  sharingOn();
  mockParams.planId = 'pl_0001';
  const { text, press } = await render(React.createElement(PublicPlan));
  expect(text()).toContain('Wheel-throwing drop-in');
  expect(text()).toContain(timeRange('2026-11-14T18:00:00Z', '2026-11-14T20:00:00Z'));
  expect(timeRange('2026-11-14T18:00:00Z', '2026-11-14T20:00:00Z')).toBe(
    'Sat, Nov 14 · 10 AM–12 PM',
  );
  expect(timeRange('2026-11-16T03:00:00Z', '2026-11-16T04:30:00Z')).toBe('Sun, Nov 15 · 7–8:30 PM');
  expect(text()).toContain('3 people are in · 2 spots left');
  expect(text()).toContain('Log in to join');
  expect(text()).not.toContain("I'm in");
  for (const p of people) expect(text()).not.toContain(p);
  const spy = shareSpy();
  await press('Share');
  expect(spy.mock.calls[0][0].message).toBe(
    'Wheel-throwing drop-in\nSat, Nov 14 · 10 AM · Hayes Valley\napp:///common-ground/shared/pl_0001',
  );
});

test('public plan page: no count line at 0, Empty on 404, not available when sharing is off', async () => {
  const p = await api.getPublicPlan('pl_0001');
  jest.spyOn(api, 'getPublicPlan').mockResolvedValueOnce({ ...p, interestedCount: 0 });
  mockParams.planId = 'pl_0001';
  const zero = await render(React.createElement(PublicPlan));
  expect(zero.text()).toContain('Wheel-throwing drop-in');
  expect(zero.text()).not.toContain('people are in');
  mockParams.planId = 'pl_nope';
  const gone = await render(React.createElement(PublicPlan));
  expect(gone.text()).toContain("This plan isn't available");
  expect(gone.text()).not.toContain('Log in to join');
  sharingOff();
  mockParams.planId = 'pl_0001';
  const off = await render(React.createElement(PublicPlan));
  expect(off.text()).toContain("This plan isn't available");
  sharingOn();
});

test('plan pop-up: Share plan sends title, time, neighborhood and the link; hidden when off', async () => {
  sharingOn();
  mockParams.planId = 'pl_0001';
  const { press, has } = await render(React.createElement(PlanScreen));
  const spy = shareSpy();
  await press('Share plan');
  const { message } = spy.mock.calls[0][0];
  expect(message).toContain('app:///common-ground/shared/pl_0001');
  for (const p of people) expect(message).not.toContain(p);
  await renderer.act(async () => sharingOff());
  expect(has('Share plan')).toBe(false);
  sharingOn();
});

test('read-only share card: one Share action with the welcome link, only when sharing is on', async () => {
  sharingOn();
  const s = store.getState().shares[0];
  const { press, has, text } = await render(
    React.createElement(ShareCard, { share: s, readOnly: true }),
  );
  expect(text()).not.toContain('Plan something like this');
  const spy = shareSpy();
  await press(`Share ${s.venue.name}`);
  const { message } = spy.mock.calls[0][0];
  expect(message).toContain('/common-ground/welcome');
  for (const p of people) expect(message).not.toContain(p);
  await renderer.act(async () => sharingOff());
  expect(has(`Share ${s.venue.name}`)).toBe(false);
  sharingOn();
});

test('Welcome ?share=<id> pins that card to the top of the gallery', async () => {
  await renderer.act(async () => void (await store.load.shares({}, { anonymous: true })));
  const last = store.getState().publicShares[3];
  mockParams.share = last.shareId;
  const { text } = await render(React.createElement(WelcomeScreen));
  const t = text();
  expect(t.indexOf(last.caption)).toBeLessThan(t.indexOf(store.getState().publicShares[0].caption));
});
