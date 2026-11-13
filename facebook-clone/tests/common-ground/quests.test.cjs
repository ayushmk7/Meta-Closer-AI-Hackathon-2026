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
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-haptics', () => ({ impactAsync: async () => {}, ImpactFeedbackStyle: {} }));
const mockSaved = {};
jest.mock('../../src/platform/scopedStorage', () => ({
  createScopedStorage: (key) => ({
    read: async () => mockSaved[key] ?? null,
    write: async (v) => void (mockSaved[key] = v),
    remove: async () => void delete mockSaved[key],
  }),
}));

const fixtures = require('../../src/features/common-ground/fixtures.json');
const store = require('../../src/features/common-ground/store');
const { default: Quests, noteSurprise } = require('../../src/features/common-ground/Quests');
const Passport = require('../../src/features/common-ground/Passport').default;

async function render(el) {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(el);
  });
  const labels = () =>
    tree.root
      .findAll((n) => typeof n.type === 'string')
      .flatMap((n) => [n.props.accessibilityLabel, n.props.children])
      .flat()
      .filter((x) => typeof x === 'string')
      .join('|');
  return { tree, labels };
}

beforeEach(() =>
  renderer.act(async () =>
    store.setState({ me: fixtures.getMe, joins: [], messages: {}, meetups: {}, feed: null }),
  ),
);

test('Verify in person ticks, saves and starts the streak; Surprise me ticks from outside', async () => {
  const { tree, labels } = await render(React.createElement(Quests));
  expect(labels()).toContain("Today's quests");
  expect(labels()).toContain('0 of 4 done');
  const talk = tree.root.find(
    (n) => n.props.accessibilityLabel === 'Verify in person' && n.props.onPress,
  );
  expect(talk.props.accessibilityState).toEqual({ checked: false });
  await renderer.act(async () => talk.props.onPress());
  expect(labels()).toContain('1 of 4 done');
  expect(labels()).toContain('1-day streak');
  const saved = JSON.parse(mockSaved['common-ground-quests:v1']);
  expect(saved[fixtures.getMe.userId]).toMatchObject({ talked: true, streak: 1 });
  await renderer.act(async () => store.setState({ feed: fixtures.getFeed }));
  const SurpriseButton = require('../../src/features/common-ground/SurpriseButton').default;
  const surprise = await render(React.createElement(SurpriseButton));
  const btn = surprise.tree.root.find(
    (n) => n.props.accessibilityLabel === 'Surprise me' && n.props.onPress,
  );
  await renderer.act(async () => btn.props.onPress());
  await renderer.act(async () => {}); // noteSurprise's storage read
  expect(require('expo-router').router.push).toHaveBeenCalled();
  expect(labels()).toContain('Try Surprise me, done');
  expect(labels()).toContain('2 of 4 done');
  await renderer.act(async () => tree.unmount());
});

const KEY = 'common-ground-quests:v1';
const talkBox = (tree) =>
  tree.root.find((n) => n.props.accessibilityLabel === 'Verify in person' && n.props.onPress);

test('card left open across LA midnight: ticks clear, streak not extended for an empty day', async () => {
  jest.useFakeTimers({
    now: new Date('2026-11-13T07:58:00Z'),
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  }); // Nov 12, 11:58 PM PST
  try {
    delete mockSaved[KEY];
    const { tree, labels } = await render(React.createElement(Quests));
    await renderer.act(async () => talkBox(tree).props.onPress());
    expect(labels()).toContain('1-day streak');
    await renderer.act(async () => {
      jest.advanceTimersByTime(3 * 60_000); // 12:01 AM Nov 13
    });
    await renderer.act(async () => {});
    expect(talkBox(tree).props.accessibilityState).toEqual({ checked: false });
    expect(labels()).toContain('0 of 4 done');
    const log = JSON.parse(mockSaved[KEY])[fixtures.getMe.userId];
    expect(log).toMatchObject({
      day: '2026-11-13',
      talked: false,
      streak: 1,
      lastDone: '2026-11-12',
    });
    await renderer.act(async () => tree.unmount());
  } finally {
    jest.useRealTimers();
  }
});

test('quests are per user: switching identity shows a fresh log and keeps the other', async () => {
  delete mockSaved[KEY];
  const a = await render(React.createElement(Quests));
  await renderer.act(async () => talkBox(a.tree).props.onPress());
  await renderer.act(async () => store.setState({ me: { ...fixtures.getMe, userId: 'u_0042' } }));
  await renderer.act(async () => {});
  expect(talkBox(a.tree).props.accessibilityState).toEqual({ checked: false });
  expect(a.labels()).not.toContain('streak');
  const all = JSON.parse(mockSaved[KEY]);
  expect(all[fixtures.getMe.userId]).toMatchObject({ talked: true });
  expect(all.u_0042).toBeUndefined();
  await renderer.act(async () => a.tree.unmount());
});

test('Passport shows collected and locked stamps', async () => {
  const m = fixtures.getMeetup;
  const done = {
    ...m,
    status: 'completed',
    attendees: m.attendees.map((a) => (a.isMe ? { ...a, checkedIn: true } : a)),
  };
  await renderer.act(async () =>
    store.setState({ meetups: { [m.meetupId]: done }, feed: fixtures.getFeed }),
  );
  const { tree, labels } = await render(React.createElement(Passport));
  expect(labels()).toContain(`${m.venue.name}, collected`);
  expect(labels()).toContain('Board game night, locked');
  expect(labels()).toMatch(/3 of \d+ stamps/);
  await renderer.act(async () => tree.unmount());
});

test('a meetup I am newly verified at ticks Verify in person once', async () => {
  delete mockSaved[KEY];
  const m = fixtures.getMeetup;
  const verified = {
    ...m,
    attendees: m.attendees.map((a) => (a.isMe ? { ...a, verified: true } : a)),
  };
  await renderer.act(async () => store.setState({ meetups: { [m.meetupId]: verified } }));
  const { tree } = await render(React.createElement(Quests));
  await renderer.act(async () => {});
  expect(talkBox(tree).props.accessibilityState).toEqual({ checked: true });
  expect(JSON.parse(mockSaved[KEY])[fixtures.getMe.userId]).toMatchObject({
    talked: true,
    verified: [m.meetupId],
  });
  // Unticking sticks: the same verify doesn't tick it again.
  await renderer.act(async () => talkBox(tree).props.onPress());
  await renderer.act(async () => {});
  expect(talkBox(tree).props.accessibilityState).toEqual({ checked: false });
  await renderer.act(async () => tree.unmount());
});

test('demo: ticks survive the staged clock jump; earned reward shows under the card', async () => {
  const day1 = new Date('2026-11-12T20:00:00Z'); // Nov 12 PT
  jest.useFakeTimers({ now: day1, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  try {
    delete mockSaved[KEY];
    await renderer.act(async () =>
      store.setState({
        config: { ...fixtures.getConfig, demo: { ...fixtures.getConfig.demo, enabled: true } },
        joins: [{ ...fixtures.joinPlan, createdAt: day1.toISOString() }],
      }),
    );
    const { tree, labels } = await render(React.createElement(Quests));
    await renderer.act(async () => noteSurprise());
    expect(labels()).toContain('Join a plan, done');
    expect(labels()).toContain('Try Surprise me, done');
    expect(labels()).not.toContain('Unlocked');
    // The meetup flow jumps the clock to Saturday and unlocks plan creation.
    jest.setSystemTime(new Date('2026-11-14T23:30:00Z'));
    await renderer.act(async () => {
      jest.advanceTimersByTime(60_000);
      const me = store.getState().me;
      store.setState({ me: { ...me, capabilities: { ...me.capabilities, canCreatePlans: true } } });
    });
    await renderer.act(async () => {});
    expect(labels()).toContain('Join a plan, done');
    expect(labels()).toContain('Try Surprise me, done');
    expect(labels()).toContain('Unlocked: Create your own plans');
    await renderer.act(async () => tree.unmount());
  } finally {
    jest.useRealTimers();
    await renderer.act(async () => store.setState({ config: null }));
  }
});

test('a completed meetup refetches me, so a fresh unlock shows under the card', async () => {
  const { api } = require('../../src/features/common-ground/api');
  const me = fixtures.getMe;
  const getMe = jest
    .spyOn(api, 'getMe')
    .mockResolvedValue({ ...me, capabilities: { ...me.capabilities, canCreatePlans: true } });
  const m = { ...fixtures.getMeetup, status: 'completed' };
  await renderer.act(async () => store.setState({ me, meetups: { [m.meetupId]: m } }));
  const { tree, labels } = await render(React.createElement(Quests));
  await renderer.act(async () => {});
  expect(getMe).toHaveBeenCalled();
  expect(labels()).toContain('Unlocked: Create your own plans');
  getMe.mockRestore();
  await renderer.act(async () => tree.unmount());
});
