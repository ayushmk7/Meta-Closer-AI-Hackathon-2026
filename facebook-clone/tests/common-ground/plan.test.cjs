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
const { BottomBar, sizeBounds } = require('../../src/features/common-ground/Plan');

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

const detail = fixtures.getPlan; // pl_0001: open, size 3..5, 3 in, 2 spots
const names = fixtures.listConnections.items.map((c) => c.person.displayName);
const bar = (patch) => React.createElement(BottomBar, { plan: { ...detail, ...patch } });

test('size bounds: config limits capped by capabilities.maxGroupSize', () => {
  expect(sizeBounds({ groupSizeMin: 3, groupSizeMax: 8 }, 6)).toEqual({ min: 3, max: 6 });
  expect(sizeBounds({ groupSizeMin: 3, groupSizeMax: 8 }, 2)).toEqual({ min: 3, max: 3 });
  expect(sizeBounds({ groupSizeMin: 3, groupSizeMax: 8 }, undefined)).toEqual({ min: 3, max: 8 });
});

test('not joined: Group size sheet clamps to [3, 6] and I am in sends it', async () => {
  const joinPlan = jest.spyOn(api, 'joinPlan');
  const { text, press } = await render(bar({ myJoin: null }));
  expect(text()).toContain("I'm in");
  await press('Group size, 3 to 5 people');
  for (let i = 0; i < 4; i++) await press('More people, at most');
  await press('Fewer people, at least');
  await press('Done');
  expect(text()).toContain('Group size, 3 to 6 people');
  await press("I'm in");
  expect(joinPlan).toHaveBeenCalledWith('pl_0001', { size: { min: 3, max: 6 } });
});

test('not joined without touching size: join sends no size', async () => {
  const joinPlan = jest.spyOn(api, 'joinPlan');
  const { press } = await render(bar({ myJoin: null, planId: 'pl_0003' }));
  await press("I'm in");
  expect(joinPlan).toHaveBeenCalledWith('pl_0003', {});
});

test('interested: progress line and Can not make it withdraws after confirm', async () => {
  store.setState({
    joins: [{ ...fixtures.joinPlan, planId: 'pl_0001', progress: { joined: 3, needed: 4 } }],
  });
  const withdraw = jest.spyOn(api, 'withdrawJoin').mockResolvedValue(undefined);
  const { text, press } = await render(
    bar({ myJoin: { joinId: 'jn_0001', status: 'interested' } }),
  );
  expect(text()).toContain("You're in. Muse needs 1 more.");
  confirmWith('Keep me in');
  await press("Can't make it");
  expect(withdraw).not.toHaveBeenCalled();
  confirmWith("Can't make it");
  await press("Can't make it");
  expect(withdraw).toHaveBeenCalledWith('pl_0001');
});

test('interested and full count: Muse is forming the group', async () => {
  store.setState({
    joins: [{ ...fixtures.joinPlan, planId: 'pl_0001', progress: { joined: 3, needed: 3 } }],
  });
  const { text } = await render(bar({ myJoin: { joinId: 'jn_0001', status: 'interested' } }));
  expect(text()).toContain("You're in. Muse is forming your group.");
});

test('matched: See plan goes to the meetup', async () => {
  const { router } = require('expo-router');
  const m = fixtures.getMeetup;
  const going = m.attendees.filter((a) => a.rsvp === 'going').length;
  store.setState({
    joins: [{ ...fixtures.joinPlan, status: 'matched', meetupId: 'mt_x' }],
    meetups: { mt_x: { ...m, meetupId: 'mt_x' } },
  });
  const { text, press } = await render(bar({ myJoin: { joinId: 'jn_0001', status: 'matched' } }));
  expect(text()).toContain(`Your group is set · ${going} going`);
  await press('See plan');
  expect(router.push).toHaveBeenCalledWith('/common-ground/meetup/mt_x');
});

test('Surprise me plan: Try another replaces with a different pick', async () => {
  const { router } = require('expo-router');
  const other = { ...detail, planId: 'pl_other', myJoin: null, status: 'open' };
  store.setState({ feed: { plans: [detail, other], prompts: [] }, joins: [] });
  const { press } = await render(
    React.createElement(BottomBar, { plan: { ...detail, myJoin: null }, surprise: true }),
  );
  await press('Try another');
  expect(router.replace).toHaveBeenCalledWith('/common-ground/plan/pl_other?surprise=1');
});

test('full and not joined: status as muted text', async () => {
  const { text, has } = await render(bar({ myJoin: null, status: 'full' }));
  expect(text()).toContain('This plan is full');
  expect(has("I'm in")).toBe(false);
});

test("C5: who's in is counts only", () => {
  const { whosIn } = require('../../src/features/common-ground/PlanCard');
  const line = whosIn(detail.crowd);
  expect(line).toBe('3 in · 2 also into ceramics · 2 spots left');
  for (const n of names) expect(line).not.toContain(n);
});

test('dayTime is Pacific and drops :00; duration uses hr/min', () => {
  const { dayTime, duration } = require('../../src/features/common-ground/PlanCard');
  expect(dayTime('2026-11-14T18:00:00Z')).toBe('Sat 10 AM');
  expect(dayTime('2026-11-14T17:30:00Z')).toBe('Sat 9:30 AM');
  expect([45, 60, 120, 150].map(duration)).toEqual(['45 min', '1 hr', '2 hr', '2 hr 30 min']);
});
