/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockScrollTo = jest.fn();
const mockDemo = {
  state: { settings: { theme: 'light' } },
  posts: Array.from({ length: 24 }, (_, index) => ({ id: `post-${index + 1}`, reactionCount: 0 })),
};
jest.mock('../../src/core/store', () => ({ useDemo: () => mockDemo }));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
jest.mock('../../src/extensions/registry', () => ({ homeSections: [] }));
jest.mock('../../src/features/feed/Components', () => {
  const React = require('react');
  return {
    Composer: () => React.createElement('Composer'),
    Stories: () => React.createElement('Stories'),
    PostCard: (props) => React.createElement('PostCard', props),
  };
});
jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const React = require('react');
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
      return React.createElement(View, props, props.children);
    }),
  };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
const { Button } = require('../../src/ui/native');
const FeedScreen = require('../../src/features/feed/Screen').default;

test('native finite feed reaches its last post and scrolls to top only when requested', async () => {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(FeedScreen));
  });
  const cards = tree.root.findAllByType('PostCard');
  expect(cards).toHaveLength(24);
  expect(cards.at(-1).props.post.id).toBe('post-24');
  expect(JSON.stringify(tree.toJSON())).toContain("You're all caught up");
  mockDemo.posts = mockDemo.posts.map((post, index) =>
    index === 12 ? { ...post, reactionCount: 1 } : post,
  );
  await renderer.act(async () => tree.update(React.createElement(FeedScreen)));
  expect(mockScrollTo).not.toHaveBeenCalled();
  const backToTop = tree.root.findAllByType(Button).find((node) => node.props.title === 'Back to top');
  await renderer.act(async () => backToTop.props.onPress());
  expect(mockScrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
  await renderer.act(async () => tree.unmount());
});
