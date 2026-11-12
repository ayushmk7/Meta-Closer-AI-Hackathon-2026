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
const { api, CgError } = require('../../src/features/common-ground/api');
const store = require('../../src/features/common-ground/store');
const PlanCard = require('../../src/features/common-ground/PlanCard').default;
const MuseBar = require('../../src/features/common-ground/MuseBar').default;
const PlansScreen = require('../../src/features/common-ground/Plans').default;

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
  return { tree, text, find };
}

const plan = fixtures.getFeed.plans[0];
const names = fixtures.listConnections.items.map((c) => c.person.displayName);

test('plan card: checks (failed one muted, no tick), crowd counts, In badge', async () => {
  const card = {
    ...plan,
    checks: [
      { kind: 'calendar', ok: true, label: 'Fits your Saturday' },
      { kind: 'cost', ok: false, label: 'Over your budget' },
    ],
    myJoin: { joinId: 'jn_x', status: 'interested' },
  };
  const { text } = await render(React.createElement(PlanCard, { plan: card }));
  expect(text()).toContain('✓ Fits your Saturday');
  expect(text()).toContain('"Over your budget"');
  expect(text()).not.toContain('✓ Over your budget');
  expect(text()).toContain('5 in · 1 spot left');
  expect(text()).toContain('"In"');
  for (const n of names) expect(text()).not.toContain(n); // C5
});

test('plans home renders with a null feed (stable selector fallbacks, no update loop)', async () => {
  store.setState({ feed: null });
  const { text } = await render(React.createElement(PlansScreen));
  expect(text()).toContain('What do you want to do?');
  await renderer.act(async () => void (await store.load.feed()));
  expect(text()).toContain('For you');
  expect(text()).toContain(plan.title);
});

test('muse bar: reply bubble and highlighted new plan; clearing returns to For you', async () => {
  const reply = { ...fixtures.askMuse, createdPlanId: fixtures.askMuse.plans[0].planId };
  jest.spyOn(api, 'askMuse').mockResolvedValue(reply);
  const { text, find } = await render(React.createElement(MuseBar));
  const input = () => find((p) => p.accessibilityLabel === 'What do you want to do?');
  await renderer.act(async () => input().props.onChangeText('pottery this weekend'));
  await renderer.act(async () => input().props.onSubmitEditing());
  expect(api.askMuse).toHaveBeenCalledWith('pottery this weekend', null);
  expect(text()).toContain(reply.reply.text);
  expect(text()).toContain('New · Muse made this plan');
  await renderer.act(async () => input().props.onChangeText(''));
  expect(store.getState().muse.reply).toBeNull();
});

test('muse bar: a failed call keeps the typed text', async () => {
  jest
    .spyOn(api, 'askMuse')
    .mockRejectedValue(new CgError(503, 'muse_unavailable', 'Muse is busy. Try again.', true));
  const { find } = await render(React.createElement(MuseBar));
  const input = () => find((p) => p.accessibilityLabel === 'What do you want to do?');
  await renderer.act(async () => input().props.onChangeText('board games'));
  await renderer.act(async () => input().props.onSubmitEditing());
  expect(input().props.value).toBe('board games');
  expect(input().props.editable).toBe(true);
  expect(store.getState().error?.message).toBe('Muse is busy. Try again.');
});

test('invite mode (?with=) ends with Ask Muse instead, and after a created plan', async () => {
  const { router } = require('expo-router');
  const daniel = fixtures.listConnections.items[0];
  store.setState({ connections: [daniel] });
  mockParams.with = daniel.person.userId;
  const created = { ...fixtures.getPlan, planId: 'pl_new' };
  const createPlan = jest.spyOn(api, 'createPlan').mockResolvedValue(created);
  const { tree, find } = await render(React.createElement(PlansScreen));
  const input = () => find((p) => p.accessibilityLabel === 'What do you want to do?');
  expect(input().props.value).toBe('Plan something with Daniel…');
  await renderer.act(async () => input().props.onSubmitEditing());
  expect(createPlan).toHaveBeenCalledWith('Plan something with Daniel…', [daniel.person.userId]);
  expect(router.setParams).toHaveBeenCalledWith({ with: undefined });
  expect(router.push).toHaveBeenCalledWith('/common-ground/plan/pl_new');
  router.setParams.mockClear();
  const cancel = tree.root.find(
    (n) => n.props.accessibilityLabel === 'Ask Muse instead' && n.props.onPress,
  );
  await renderer.act(async () => cancel.props.onPress());
  expect(router.setParams).toHaveBeenCalledWith({ with: undefined });
  delete mockParams.with;
  store.setState({ connections: [] });
});

test('a fresh join row (no plan on the Join) takes its title from the feed card', async () => {
  const card = fixtures.getFeed.plans[0];
  const { plan: _omit, ...bare } = {
    ...fixtures.joinPlan,
    planId: card.planId,
    joinId: 'jn_fresh',
  };
  await renderer.act(async () => void (await store.load.feed()));
  store.setState({ joins: [bare] });
  const { text } = await render(React.createElement(PlansScreen));
  expect(text()).toContain(
    `Muse is gathering people · ${bare.progress.joined} of ${bare.progress.needed}`,
  );
  expect(text()).not.toContain('"Your plan"');
  store.setState({ joins: [] });
});
