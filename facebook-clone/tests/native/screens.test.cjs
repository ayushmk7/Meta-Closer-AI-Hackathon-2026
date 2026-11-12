/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockParams = {};
const mockMaya = {
  id: 'maya',
  name: 'Maya Chen',
  avatar: 'maya',
  cover: 'cover',
  bio: 'A local demo',
  location: 'San Francisco',
  online: true,
};
const mockNora = { ...mockMaya, id: 'nora', name: 'Nora Williams', avatar: 'nora' };
const mockDemo = {
  state: {
    settings: { theme: 'light', audience: 'Friends' },
    sentRequestIds: [],
    reactions: {},
    savedPostIds: [],
  },
  seed: { viewerId: 'maya', people: [mockMaya, mockNora], suggestions: [] },
  person: (id) => (id === 'nora' ? mockNora : mockMaya),
  friends: [],
  posts: [],
  requests: [{ id: 'request-nora', personId: 'nora', mutual: 4 }],
  actions: { decideRequest: jest.fn() },
};
jest.mock('../../src/core/store', () => ({ useDemo: () => mockDemo }));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
jest.mock('../../src/platform/photo', () => ({ pickPhoto: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
const { Button } = require('../../src/ui/native');
const { PostCard } = require('../../src/features/feed/Components');
const FriendsScreen = require('../../src/features/friends/Screen').default;
const ProfileScreen = require('../../src/features/profile/Screen').default;

beforeEach(() => {
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  mockDemo.friends = [];
  mockDemo.seed.suggestions = [];
  jest.clearAllMocks();
});

test('native notification request links select Requests and confirm the referenced request', async () => {
  mockParams.section = 'requests';
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(FriendsScreen));
  });
  expect(JSON.stringify(tree.toJSON())).toContain('Friend requests');
  const confirm = tree.root
    .findAllByType(Button)
    .find((node) => node.props.accessibilityLabel === 'Confirm Nora Williams');
  expect(confirm).toBeDefined();
  await renderer.act(async () => confirm.props.onPress());
  expect(mockDemo.actions.decideRequest).toHaveBeenCalledWith('request-nora', 'confirmed');
  await renderer.act(async () => tree.unmount());
});

test('native unknown profile ID shows not-found content instead of the fallback viewer profile', async () => {
  mockParams.id = 'missing-person';
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(ProfileScreen));
  });
  const content = JSON.stringify(tree.toJSON());
  expect(content).toContain('Profile not found');
  expect(content).not.toContain('Edit profile');
  await renderer.act(async () => tree.unmount());
});

test.each([
  ['Friends', FriendsScreen],
  ['Profile', ProfileScreen],
])('%s suggestions show confirmed friends as disabled Friends actions', async (_name, Screen) => {
  mockParams.section = 'suggestions';
  mockDemo.friends = [mockNora];
  mockDemo.seed.suggestions = ['nora'];
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(Screen));
  });
  const suggestion = tree.root.findAllByType(Button).find((node) => node.props.title === 'Friends');
  expect(suggestion).toBeDefined();
  expect(suggestion.props.disabled).toBe(true);
  expect(tree.root.findAllByType(Button).some((node) => node.props.title === 'Add friend')).toBe(
    false,
  );
  await renderer.act(async () => tree.unmount());
});

test('native public post preview preserves content and comments without mutation controls', async () => {
  const post = {
    id: 'public-post',
    authorId: 'maya',
    text: 'A public moment',
    time: 'Yesterday',
    audience: 'Public',
    photos: [],
    reactionCount: 3,
    comments: [{ id: 'comment-1', authorId: 'nora', text: 'Lovely moment!', time: 'Yesterday' }],
  };
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(PostCard, { post, readOnly: true }));
  });
  const content = JSON.stringify(tree.toJSON());
  expect(content).toContain('A public moment');
  expect(content).toContain('Lovely moment!');
  for (const label of [
    'Options for Maya',
    'React to post',
    'Comment on post',
    'Write a comment',
    'Send comment',
    'Share local demo post',
    'Save post',
  ])
    expect(content).not.toContain(label);
  await renderer.act(async () => tree.unmount());
});
