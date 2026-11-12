/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
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
const store = require('../../src/features/common-ground/store');
const { pickSurprise } = require('../../src/features/common-ground/SurpriseButton');
const SurpriseButton = require('../../src/features/common-ground/SurpriseButton').default;
const { router } = require('expo-router');

const base = fixtures.getFeed.plans[0];
const card = (planId, over = {}) => ({ ...base, planId, status: 'open', myJoin: null, ...over });

test('pickSurprise: excludes joined, full and closed; uniform via injected rng', () => {
  const plans = [
    card('a'),
    card('b', { myJoin: { joinId: 'j', status: 'interested' } }),
    card('c', { status: 'full' }),
    card('d', { status: 'closed' }),
    card('e', { crowd: { ...base.crowd, spotsLeft: 0 } }),
    card('f'),
    card('g', { myJoin: { joinId: 'j', status: 'withdrawn' } }),
    card('h'),
  ];
  const joins = [{ planId: 'h', status: 'matched' }];
  // pool = a, f, g
  expect(pickSurprise(plans, joins, () => 0).planId).toBe('a');
  expect(pickSurprise(plans, joins, () => 0.5).planId).toBe('f');
  expect(pickSurprise(plans, joins, () => 0.999).planId).toBe('g');
  expect(pickSurprise([card('x', { status: 'full' })], [], () => 0)).toBeUndefined();
  expect(pickSurprise([], [], () => 0)).toBeUndefined();
});

beforeAll(async () => {
  await store.reset();
  await store.start();
  await store.optIn('city');
});
afterEach(() => jest.restoreAllMocks());

async function render(el) {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(el);
  });
  const btn = () =>
    tree.root.findAll((n) => n.props.accessibilityLabel === 'Surprise me' && n.props.onPress)[0];
  return { tree, btn };
}

test('tap loads a missing feed, then opens a qualifying plan', async () => {
  store.setState({ feed: null, joins: [] });
  router.push.mockClear();
  jest.spyOn(Math, 'random').mockReturnValue(0);
  const { tree, btn } = await render(React.createElement(SurpriseButton));
  await renderer.act(async () => btn().props.onPress());
  const pool = store
    .getState()
    .feed.plans.filter((p) => p.status === 'open' && !p.myJoin && p.crowd.spotsLeft > 0);
  expect(router.push).toHaveBeenCalledWith(`/common-ground/plan/${pool[0].planId}`);
  await renderer.act(async () => tree.unmount());
});

test('nothing qualifies: inline note, no navigation', async () => {
  store.setState({ feed: { ...fixtures.getFeed, plans: [card('z', { status: 'full' })] } });
  router.push.mockClear();
  const { tree, btn } = await render(React.createElement(SurpriseButton));
  await renderer.act(async () => btn().props.onPress());
  expect(router.push).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Nothing new right now. Try the Muse bar.');
  await renderer.act(async () => tree.unmount());
});
