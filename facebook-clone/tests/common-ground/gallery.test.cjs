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
const { api } = require('../../src/features/common-ground/api');
const store = require('../../src/features/common-ground/store');
const ShareCard = require('../../src/features/common-ground/ShareCard').default;
const { shareDate } = require('../../src/features/common-ground/ShareCard');
const ExploreScreen = require('../../src/features/common-ground/Explore').default;
const { filterShares } = require('../../src/features/common-ground/Explore');
const WelcomeScreen = require('../../src/features/common-ground/Welcome').default;
const ShareMeetup = require('../../src/features/common-ground/ShareMeetup').default;
const { router } = require('expo-router');

beforeAll(async () => {
  await store.reset();
  await store.start();
  await store.optIn('city');
  await store.load.shares();
});
const mounted = [];
afterEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  await renderer.act(async () => mounted.splice(0).forEach((t) => t.unmount()));
  store.setState({ error: null });
});
async function render(el) {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(el);
  });
  mounted.push(tree);
  const text = () =>
    JSON.stringify(
      tree.root
        .findAll((n) => typeof n.type === 'string')
        .flatMap((n) => [n.props.accessibilityLabel, n.props.children])
        .flat()
        .filter((x) => typeof x === 'string' || typeof x === 'number'),
    );
  const press = async (label) => {
    const node = tree.root.find(
      (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
    );
    await renderer.act(async () => node.props.onPress());
  };
  const has = (label) => tree.root.findAll((n) => n.props.accessibilityLabel === label).length > 0;
  return { tree, text, press, has };
}
const shares = () => store.getState().shares;
const share = () => shares().find((s) => s.shareId === 'sh_0001');
// Every person-ish string the fixtures know: none may reach a share card.
const people = [
  ...fixtures.listConnections.items.flatMap((c) => [c.person.displayName, c.person.userId]),
  fixtures.getMe.displayName,
  fixtures.getMe.userId,
].filter(Boolean);

test('share card: post layout, no person fields, date is the LA day', async () => {
  expect(shares().length).toBe(8);
  const { text } = await render(React.createElement(ShareCard, { share: share() }));
  expect(text()).toContain('Hayes Clay Studio');
  expect(text()).toContain(share().caption);
  expect(shareDate('2026-11-14')).toBe('Nov 14');
  for (const p of people) expect(text()).not.toContain(p);
});

test('share card: no reactions row until someone likes it', async () => {
  const fresh = { ...share(), likes: 0, likedByMe: false };
  const { text } = await render(React.createElement(ShareCard, { share: fresh }));
  expect(text()).not.toContain('0');
});

test('Like is optimistic and toggles through likeShare', async () => {
  const before = share().likes;
  const { press } = await render(React.createElement(ShareCard, { share: share() }));
  await press('Like Hayes Clay Studio');
  expect(share().likedByMe).toBe(true);
  expect(share().likes).toBe(before + 1);
  await renderer.act(async () => void (await store.likeShare('sh_0001', false)));
  expect(share().likedByMe).toBe(false);
  expect(share().likes).toBe(before);
});

test('Plan something like this: likes, then askMuse without canCreatePlans', async () => {
  store.setState({
    me: {
      ...store.getState().me,
      capabilities: { ...store.getState().me.capabilities, canCreatePlans: false },
    },
  });
  const s = { ...shares()[1], likedByMe: false };
  const like = jest.spyOn(api, 'likeShare');
  const ask = jest.spyOn(api, 'askMuse');
  const create = jest.spyOn(api, 'createPlan');
  const { press } = await render(React.createElement(ShareCard, { share: s }));
  await press(`Plan something like this: ${s.promptText}`);
  expect(like).toHaveBeenCalledWith(s.shareId, true);
  expect(ask.mock.calls[0][0]).toBe(s.promptText);
  expect(create).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith('/common-ground');
});

test('Plan something like this: createPlan with canCreatePlans, then the plan opens', async () => {
  store.setState({
    me: {
      ...store.getState().me,
      capabilities: { ...store.getState().me.capabilities, canCreatePlans: true },
    },
  });
  const s = shares()[2];
  const create = jest.spyOn(api, 'createPlan');
  const { press } = await render(React.createElement(ShareCard, { share: s }));
  await press(`Plan something like this: ${s.promptText}`);
  expect(create).toHaveBeenCalledWith(s.promptText, undefined);
  expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/common-ground\/plan\//));
});

test('Explore filters by activity and neighborhood', async () => {
  const all = shares();
  const hood = all[0].venue.neighborhood;
  expect(filterShares(all, 'All', 'Everywhere')).toHaveLength(all.length);
  const byHood = filterShares(all, 'All', hood);
  expect(byHood.length).toBeGreaterThan(0);
  expect(byHood.every((s) => s.venue.neighborhood === hood)).toBe(true);
  const { text } = await render(React.createElement(ExploreScreen));
  expect(text()).toContain('Explore');
  expect(text()).toContain('Ceramics studio');
  for (const p of people) expect(text()).not.toContain(p);
});

test('Welcome: read-only gallery, Log in and Create new account enter Plans', async () => {
  const list = jest.spyOn(api, 'listShares');
  const { text, press, has } = await render(React.createElement(WelcomeScreen));
  expect(list).toHaveBeenCalledWith({}, { anonymous: true }); // logged out: no X-CG-User
  // Reads only the anonymous slot: emptying the signed-in gallery changes nothing here.
  expect(store.getState().publicShares.length).toBeGreaterThan(0);
  await renderer.act(async () => store.setState({ shares: [] }));
  expect(text()).toContain('Hayes Clay Studio');
  await renderer.act(async () => void (await store.load.shares()));
  // Full-screen modal: covers the logged-in Shell chrome (header, tabs).
  const modal = (await render(React.createElement(WelcomeScreen))).tree.root.findByType(
    require('react-native').Modal,
  );
  expect(modal.props.presentationStyle).toBe('fullScreen');
  expect(text()).toContain('facebook');
  expect(text()).toContain('Create new account');
  expect(has('Like Hayes Clay Studio')).toBe(false); // read-only
  await press('Create new account');
  expect(router.replace).toHaveBeenCalledWith('/common-ground');
});

test('ShareMeetup: only after a completed meetup I went to; sends the trimmed caption', async () => {
  const m = fixtures.getMeetup;
  const r1 = await render(React.createElement(ShareMeetup, { m: { ...m, status: 'confirmed' } }));
  expect(r1.text()).not.toContain('Never names or faces');
  const send = jest
    .spyOn(api, 'shareMeetup')
    .mockResolvedValue({ ...share(), shareId: 'sh_new', mine: true });
  const done = { ...m, status: 'completed' };
  const { tree, text, press } = await render(React.createElement(ShareMeetup, { m: done }));
  expect(text()).toContain('Never names or faces');
  const input = tree.root.find(
    (n) => n.props.accessibilityLabel === 'Caption' && n.props.onChangeText,
  );
  await renderer.act(async () => input.props.onChangeText('  Lopsided bowls, great people  '));
  await press('Share to Explore');
  expect(send).toHaveBeenCalledWith(
    m.meetupId,
    { caption: 'Lopsided bowls, great people' }.caption,
  );
  expect(text()).toContain('Shared to Explore');
  expect(shares()[0].shareId).toBe('sh_new');
});

test('IdeasRow: compact cards from the gallery; See all opens Explore', async () => {
  const IdeasRow = require('../../src/features/common-ground/IdeasRow').default;
  const { text, press } = await render(React.createElement(IdeasRow));
  expect(text()).toContain('Ideas from people nearby');
  expect(text()).toContain(`Plan something like this: ${shares()[0].promptText}`);
  for (const p of people) expect(text()).not.toContain(p);
  await press('See all ideas in Explore');
  expect(router.push).toHaveBeenCalledWith('/common-ground/explore');
});

test('Plan something like this: a second tap while in flight is dropped', async () => {
  const { planFromShare } = require('../../src/features/common-ground/ShareCard');
  let resolve;
  const ask = jest
    .spyOn(api, 'askMuse')
    .mockImplementationOnce(() => new Promise((r) => (resolve = r)));
  store.setState({
    me: {
      ...store.getState().me,
      capabilities: { ...store.getState().me.capabilities, canCreatePlans: false },
    },
  });
  const s = shares()[3];
  const first = planFromShare(s);
  await planFromShare(s);
  expect(ask).toHaveBeenCalledTimes(1);
  resolve(fixtures.askMuse);
  await renderer.act(async () => void (await first));
  await renderer.act(async () => void (await planFromShare(s).catch(() => {})));
  expect(ask).toHaveBeenCalledTimes(2); // released after the first finished
});
