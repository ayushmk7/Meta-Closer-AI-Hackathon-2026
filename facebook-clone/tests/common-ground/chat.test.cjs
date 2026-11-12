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
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker' }));
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

const { api, CgError } = require('../../src/features/common-ground/api');
const store = require('../../src/features/common-ground/store');
const { PlanForm } = require('../../src/features/common-ground/Chat');

beforeAll(async () => {
  await store.reset();
  await store.start();
});
afterEach(() => {
  jest.restoreAllMocks();
  store.setState({ error: null });
});

const meetup = { meetupId: 'mt_t', threadId: 'th_t', status: 'proposing', options: [] };
async function render(group) {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(PlanForm, { threadId: 'th_t', group }));
  });
  const text = () => JSON.stringify(tree.toJSON());
  const press = async (label) => {
    const node = tree.root.find(
      (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
    );
    await renderer.act(async () => node.props.onPress());
  };
  const type = async (value) => {
    const input = tree.root.find(
      (n) => n.props.accessibilityLabel === 'Anything in mind?' && n.props.onChangeText,
    );
    await renderer.act(async () => input.props.onChangeText(value));
  };
  return { tree, text, press, type };
}

test('direct thread: the note goes to planMeetup without a size, then the form closes', async () => {
  const plan = jest.spyOn(api, 'planMeetup').mockResolvedValue(meetup);
  const { text, press, type } = await render(false);
  expect(text()).not.toContain('Plan something with Muse');
  await press('Plan something');
  expect(text()).toContain('Plan something with Muse');
  expect(text()).not.toContain('How many people?');
  await type('  something outdoors on Saturday ');
  await press('Ask Muse');
  expect(plan).toHaveBeenCalledWith('th_t', { note: 'something outdoors on Saturday' });
  expect(text()).not.toContain('Plan something with Muse');
});

test('group thread: the size stays within config and my cap and is sent', async () => {
  const plan = jest.spyOn(api, 'planMeetup').mockResolvedValue(meetup);
  const { text, press } = await render(true);
  await press('Plan something');
  expect(text()).toContain('How many people?');
  // Mock: groupSizeMin 2, groupSizeMax 8, my maxGroupSize 4, my groupSize 2..4.
  await press('More people, at most');
  await press('Fewer people, at least');
  await press('Fewer people, at most');
  await press('Ask Muse');
  expect(plan).toHaveBeenCalledWith('th_t', { size: { min: 2, max: 3 } });
});

test('a failed plan keeps the form open with the note', async () => {
  jest
    .spyOn(api, 'planMeetup')
    .mockRejectedValue(new CgError(503, 'muse_unavailable', 'Muse is busy. Try again.', true));
  const { text, press, type } = await render(false);
  await press('Plan something');
  await type('board games');
  await press('Ask Muse');
  expect(text()).toContain('Plan something with Muse');
  expect(text()).toContain('board games');
  expect(store.getState().error?.message).toBe('Muse is busy. Try again.');
});
