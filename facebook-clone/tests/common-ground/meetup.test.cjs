/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockParams = {};
jest.mock('../../src/core/store', () => ({
  useDemo: () => ({ state: { settings: { theme: 'light' } } }),
}));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn() }));
jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: 'MapView',
  Marker: 'Marker',
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

const { Button } = require('../../src/ui/native');
const { api } = require('../../src/features/common-ground/api');
const store = require('../../src/features/common-ground/store');
const MeetupScreen = require('../../src/features/common-ground/Meetup').default;
const { VotingCard } = require('../../src/features/common-ground/Meetup');

afterEach(() => jest.restoreAllMocks());

test('VotingCard shows the option and votes yes', async () => {
  const onVote = jest.fn();
  const option = {
    optionId: 'op_1',
    activity: 'Open wheel session',
    venue: {
      venueId: 'v',
      name: 'Sunset Clay Studio',
      neighborhood: 'Inner Sunset',
      location: { lat: 0, lng: 0 },
      kind: 'studio',
    },
    startsAt: '2026-11-16T21:00:00Z',
    endsAt: '2026-11-16T23:00:00Z',
    reason: 'Wheels free on Sunday.',
    votes: { yes: 2, no: 1 },
    myVote: null,
  };
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(VotingCard, { option, onVote }));
  });
  const text = JSON.stringify(tree.toJSON());
  for (const s of [
    'Open wheel session',
    'Sunset Clay Studio',
    'Wheels free on Sunday.',
    '2',
    ' yes · ',
    '1',
    ' no',
  ])
    expect(text).toContain(s);
  const yes = tree.root.findAllByType(Button).find((b) => b.props.title === 'Yes');
  await renderer.act(async () => yes.props.onPress());
  expect(onVote).toHaveBeenCalledWith('yes');
});

test('a confirmed meetup from the mock shows title, event label and Check in', async () => {
  await store.reset();
  await store.start();
  await store.decide('sg_0001', 'connect');
  const planned = await api.planMeetup('th_0001');
  const real = Date.now.bind(Date);
  jest.spyOn(Date, 'now').mockImplementation(() => real() + 5000); // mock options appear after 2.5 s
  const voting = await api.getMeetup(planned.meetupId);
  expect(voting.status).toBe('voting');
  const confirmed = await api.voteMeetup(planned.meetupId, [
    { optionId: voting.options[0].optionId, vote: 'yes' },
  ]);
  expect(confirmed.status).toBe('confirmed');
  mockParams.meetupId = planned.meetupId;
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(MeetupScreen));
  });
  const text = JSON.stringify(tree.toJSON());
  expect(text).toContain(confirmed.title);
  expect(text).toContain(confirmed.eventLabel);
  expect(text).toContain('Check in');
  expect(text).toContain('MapView');
  await renderer.act(async () => tree.unmount());
});
