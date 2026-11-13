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

test('plan card: met checks only, crowd counts, In badge', async () => {
  const card = {
    ...plan,
    checks: [
      { kind: 'calendar', ok: true, label: 'Fits your Saturday' },
      { kind: 'cost', ok: false, label: 'Over your budget' },
    ],
    myJoin: { joinId: 'jn_x', status: 'interested' },
  };
  const { tree, text } = await render(React.createElement(PlanCard, { plan: card }));
  expect(text()).toContain('"Fits your Saturday"');
  expect(text()).not.toContain('Over your budget'); // unmet checks stay on the Plan pop-up
  expect(text()).not.toContain('✓'); // met checks use the checkmark icon, not a text tick
  const ticks = tree.root.findAll((n) => n.props.name === 'checkmark-circle');
  expect(ticks.length).toBeGreaterThan(0);
  expect(text()).toContain('5 in · 1 spot left');
  expect(text()).toContain('"In"');
  for (const n of names) expect(text()).not.toContain(n); // C5
});

test('plan cards (and the skeleton) are all the same size whatever the content', async () => {
  const { PlanCardSkeleton } = require('../../src/features/common-ground/PlanCard');
  const { StyleSheet } = require('react-native');
  const long = {
    ...plan,
    title: 'A very long plan title that would wrap onto three or even four lines if allowed',
    reason: 'A long reason. '.repeat(20),
    venue: { ...plan.venue, photoUrl: null },
    checks: [
      { kind: 'calendar', ok: true, label: 'Fits your Saturday' },
      { kind: 'cost', ok: false, label: 'Over your budget' },
      { kind: 'distance', ok: true, label: 'Near you' },
      { kind: 'interest', ok: true, label: 'You like this' },
    ],
    myJoin: { joinId: 'jn_x', status: 'interested' },
  };
  const short = { ...plan, title: 'Walk', reason: '', checks: [], myJoin: undefined };
  const size = async (el) => {
    const { tree } = await render(el);
    const host = tree.root.find((n) => typeof n.type === 'string');
    const { width, height } = StyleSheet.flatten(host.props.style);
    return { width, height };
  };
  const a = await size(React.createElement(PlanCard, { plan: long, badge: 'New' }));
  const b = await size(React.createElement(PlanCard, { plan: short }));
  const sk = await size(React.createElement(PlanCardSkeleton));
  expect(a.height).toBeGreaterThan(0);
  expect(b).toEqual(a);
  expect(sk).toEqual(a);
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
  jest.useFakeTimers(); // MuseBar holds the checklist for at least 900 ms
  await renderer.act(async () => input().props.onChangeText('pottery this weekend'));
  await renderer.act(async () => void input().props.onSubmitEditing());
  await renderer.act(async () => void jest.advanceTimersByTime(900));
  jest.useRealTimers();
  expect(api.askMuse).toHaveBeenCalledWith('pottery this weekend', null);
  expect(text()).toContain(reply.reply.text);
  expect(text()).toContain('New · Muse made this meetup');
  await renderer.act(async () => input().props.onChangeText(''));
  expect(store.getState().muse.reply).toBeNull();
});

test('muse bar: thinking checklist while asking; last line spins until the reply', async () => {
  jest.useFakeTimers();
  let resolve;
  jest.spyOn(api, 'askMuse').mockReturnValue(new Promise((r) => (resolve = r)));
  const { tree, text, find } = await render(React.createElement(MuseBar));
  const input = () => find((p) => p.accessibilityLabel === 'What do you want to do?');
  await renderer.act(async () => input().props.onChangeText('pottery'));
  await renderer.act(async () => void input().props.onSubmitEditing());
  expect(text()).toContain('Muse is reading what you asked…');
  await renderer.act(async () => void jest.advanceTimersByTime(5000));
  expect(text()).toContain('Muse is picking meetups…');
  const spinning = () => tree.root.findAll((n) => n.type === 'ActivityIndicator').length;
  expect(spinning()).toBe(1); // the last line has not ticked
  await renderer.act(async () => resolve(fixtures.askMuse));
  expect(text()).not.toContain('Muse is picking meetups…');
  expect(text()).toContain(fixtures.askMuse.reply.text);
  jest.useRealTimers();
});

test('muse bar: a failed call keeps the typed text', async () => {
  jest
    .spyOn(api, 'askMuse')
    .mockRejectedValue(new CgError(503, 'muse_unavailable', 'Muse is busy. Try again.', true));
  const { find } = await render(React.createElement(MuseBar));
  const input = () => find((p) => p.accessibilityLabel === 'What do you want to do?');
  jest.useFakeTimers();
  await renderer.act(async () => input().props.onChangeText('board games'));
  await renderer.act(async () => void input().props.onSubmitEditing());
  await renderer.act(async () => void jest.advanceTimersByTime(900));
  jest.useRealTimers();
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
  expect(input().props.value).toBe('Meet up with Daniel…');
  await renderer.act(async () => input().props.onSubmitEditing());
  expect(createPlan).toHaveBeenCalledWith('Meet up with Daniel…', [daniel.person.userId]);
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
  const bare = {
    // joinPlan returns no `plan`
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

test('Muse bar: Enter and the send tap in one frame ask (or create) once', async () => {
  jest.spyOn(api, 'askMuse').mockReturnValue(new Promise(() => {}));
  jest.spyOn(api, 'createPlan').mockReturnValue(new Promise(() => {}));
  for (const props of [{ inviteUserIds: ['u_0002'] }, {}]) {
    const { tree, find } = await render(React.createElement(MuseBar, props));
    const input = find((p) => p.placeholder === 'What do you want to do?');
    await renderer.act(async () => input.props.onChangeText('pottery'));
    const send = tree.root.find((n) => n.props.label === 'Send to Muse');
    await renderer.act(async () => {
      input.props.onSubmitEditing();
      send.props.onPress();
    });
  }
  expect(api.askMuse).toHaveBeenCalledTimes(1);
  expect(api.createPlan).toHaveBeenCalledTimes(1);
});
