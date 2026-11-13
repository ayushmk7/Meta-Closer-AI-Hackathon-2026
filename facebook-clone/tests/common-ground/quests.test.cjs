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
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
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

test('Talk to a person ticks, saves and starts the streak; Surprise me ticks from outside', async () => {
  const { tree, labels } = await render(React.createElement(Quests));
  expect(labels()).toContain("Today's quests");
  expect(labels()).toContain('0 of 4 done');
  const talk = tree.root.find(
    (n) => n.props.accessibilityLabel === 'Talk to a person' && n.props.onPress,
  );
  expect(talk.props.accessibilityState).toEqual({ checked: false });
  await renderer.act(async () => talk.props.onPress());
  expect(labels()).toContain('1 of 4 done');
  expect(labels()).toContain('1-day streak');
  const saved = JSON.parse(mockSaved['common-ground-quests:v1']);
  expect(saved).toMatchObject({ talked: true, streak: 1 });
  await renderer.act(async () => noteSurprise());
  expect(labels()).toContain('Try Surprise me, done');
  expect(labels()).toContain('2 of 4 done');
  await renderer.act(async () => tree.unmount());
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
