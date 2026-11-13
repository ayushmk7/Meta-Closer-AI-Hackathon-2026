/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../src/core/store', () => ({
  useDemo: () => ({ state: { settings: { theme: 'light' } } }),
}));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-reanimated', () => require('./reanimated.cjs'));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('../../src/platform/scopedStorage', () => ({
  createScopedStorage: () => ({
    read: async () => null,
    write: async () => {},
    remove: async () => {},
  }),
}));

const fixtures = require('../../src/features/common-ground/fixtures.json');
const { api } = require('../../src/features/common-ground/api');
const store = require('../../src/features/common-ground/store');
const {
  default: Rewards,
  SameTimeNextWeek,
  nextWeek,
} = require('../../src/features/common-ground/Rewards');

const mounted = [];
afterEach(async () => {
  jest.restoreAllMocks();
  await renderer.act(async () => mounted.splice(0).forEach((t) => t.unmount()));
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
  return { tree, text };
}
const setMe = (patch) =>
  renderer.act(async () => store.setState({ me: { ...fixtures.getMe, ...patch } }));

test('renders nothing without me.rewards', async () => {
  await setMe({ rewards: undefined });
  const { tree } = await render(React.createElement(Rewards));
  expect(tree.toJSON()).toBeNull();
});

test('shows next unlock, dots, streak, Regular badge and the privacy line', async () => {
  await setMe({
    rewards: {
      confirmedMeetups: 0,
      streakWeeks: 3,
      nextUnlock: { unlockId: 'create_plans', label: 'Create your own plans', remaining: 1 },
    },
  });
  const r1 = await render(React.createElement(Rewards));
  expect(r1.text()).toContain('1 more meetup to create your own plans');
  expect(r1.text()).toContain('3-week streak');
  expect(r1.text()).toContain('Only you can see this.');
  expect(r1.text()).not.toContain('Regular');
  const bar = r1.tree.root.find((n) => n.props.accessibilityRole === 'progressbar');
  expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 1, now: 0 });

  await setMe({
    rewards: { confirmedMeetups: 5, streakWeeks: 0, nextUnlock: null },
    unlocks: [{ unlockId: 'regular', label: 'Regular badge', earnedAt: '2026-11-01T00:00:00Z' }],
  });
  const r2 = await render(React.createElement(Rewards));
  expect(r2.text()).toContain('Regular');
  expect(r2.text()).not.toContain('streak');
  expect(r2.text()).not.toContain('more meetup');
});

test('renders nothing when all unlocked, no streak and no Regular', async () => {
  await setMe({ rewards: { confirmedMeetups: 5, streakWeeks: 0, nextUnlock: null }, unlocks: [] });
  const { tree } = await render(React.createElement(Rewards));
  expect(tree.toJSON()).toBeNull();
});

test('Plan it again next week creates the same plan 7 days later, only once feedback is in', async () => {
  const m = { ...fixtures.getMeetup, status: 'completed', feedbackDue: false };
  const can = { ...fixtures.getMe.capabilities, canCreatePlans: true };
  await setMe({ capabilities: { ...can, canCreatePlans: false } });
  expect((await render(React.createElement(SameTimeNextWeek, { m }))).tree.toJSON()).toBeNull();
  await setMe({ capabilities: can });
  const flag = (userPlans) =>
    renderer.act(async () =>
      store.setState({
        config: { ...fixtures.getConfig, features: { ...fixtures.getConfig.features, userPlans } },
      }),
    );
  await flag(false);
  expect((await render(React.createElement(SameTimeNextWeek, { m }))).tree.toJSON()).toBeNull();
  await flag(true);
  const due = { ...m, feedbackDue: true };
  expect(
    (await render(React.createElement(SameTimeNextWeek, { m: due }))).tree.toJSON(),
  ).toBeNull();

  const create = jest.spyOn(api, 'createPlan').mockResolvedValue(fixtures.createPlan);
  const { tree } = await render(React.createElement(SameTimeNextWeek, { m }));
  const btn = tree.root.find(
    (n) => n.props.accessibilityLabel === 'Plan it again next week' && n.props.onPress,
  );
  await renderer.act(async () => btn.props.onPress());
  // fixture starts Sat Nov 14 10 AM PT -> Sat Nov 21 (when() drops ":00", UX guide 1.1).
  expect(create).toHaveBeenCalledWith(
    `${m.title} at ${m.venue.name}, Sat, Nov 21 · 10 AM`,
    undefined,
  );
});

test('nextWeek keeps the LA wall-clock time across DST', () => {
  expect(nextWeek('2026-10-31T17:00:00Z')).toBe('2026-11-07T18:00:00.000Z'); // 10 AM PDT -> 10 AM PST
  expect(nextWeek('2027-03-13T18:30:00Z')).toBe('2027-03-20T17:30:00.000Z'); // 10:30 AM PST -> PDT
  expect(nextWeek('2026-11-14T18:00:00Z')).toBe('2026-11-21T18:00:00.000Z');
});
