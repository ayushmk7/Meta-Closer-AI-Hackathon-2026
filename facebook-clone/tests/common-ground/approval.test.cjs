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
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('react-native-reanimated', () => require('./reanimated.cjs'));
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

const F = require('../../src/features/common-ground/fixtures.json');
const { api } = require('../../src/features/common-ground/api');
const store = require('../../src/features/common-ground/store');
const clone = (x) => JSON.parse(JSON.stringify(x));

beforeAll(async () => {
  await store.reset();
  await store.start();
});
const mounted = [];
afterEach(async () => {
  await renderer.act(async () => mounted.splice(0).forEach((t) => t.unmount()));
  jest.restoreAllMocks();
  store.setState({ error: null });
});

async function render(element) {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(element);
  });
  mounted.push(tree);
  const text = () => JSON.stringify(tree.toJSON());
  const byLabel = (label) =>
    tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.type !== 'string')[0];
  const press = async (label) => {
    const node = tree.root.find(
      (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
    );
    await renderer.act(async () => node.props.onPress());
  };
  return { tree, text, byLabel, press };
}

const ApprovalSheet = require('../../src/features/common-ground/ApprovalSheet').default;
const approval = () => clone(F.getMeetup.approvals[0]);
const layout = async (tree) => {
  const amount = tree.root.find(
    (n) =>
      typeof n.props.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith('Amount') &&
      n.props.onLayout,
  );
  await renderer.act(async () => amount.props.onLayout({ nativeEvent: { layout: {} } }));
};
const approveDisabled = (byLabel) => byLabel('Approve $35').props.accessibilityState.disabled;

test('C8: Approve stays disabled until the amount renders; nothing approves without a tap', async () => {
  const decide = jest.spyOn(api, 'decideApproval');
  const { tree, text, press, byLabel } = await render(
    React.createElement(ApprovalSheet, { approval: approval() }),
  );
  await press('Review: OK $35 for your wheel?');
  expect(text()).toContain('$35');
  expect(text()).toContain('To Hayes Clay Studio');
  expect(text()).not.toContain('Demo payment');
  expect(text()).toContain('Muse asks Hayes Clay Studio to hold your wheel');
  expect(approveDisabled(byLabel)).toBe(true);
  await layout(tree);
  expect(approveDisabled(byLabel)).toBe(false);
  expect(decide).not.toHaveBeenCalled();
});

test('Approve sends approve and buzzes; Pay at the venue sends decline', async () => {
  const Haptics = require('expo-haptics');
  const decide = jest.spyOn(api, 'decideApproval').mockImplementation(async (id, d) => ({
    ...approval(),
    status: d === 'approve' ? 'approved' : 'declined',
  }));
  const a = await render(React.createElement(ApprovalSheet, { approval: approval() }));
  await a.press('Review: OK $35 for your wheel?');
  await layout(a.tree);
  await a.press('Approve $35');
  expect(decide).toHaveBeenLastCalledWith('ap_0001', 'approve');
  expect(Haptics.notificationAsync).toHaveBeenCalled();

  const b = await render(React.createElement(ApprovalSheet, { approval: approval() }));
  await b.press('Review: OK $35 for your wheel?');
  await b.press('Pay at the venue');
  expect(decide).toHaveBeenLastCalledWith('ap_0001', 'decline');
});

test('a decided approval shows its outcome, not the review button', async () => {
  const { text, byLabel } = await render(
    React.createElement(ApprovalSheet, { approval: { ...approval(), status: 'approved' } }),
  );
  expect(byLabel('Review: OK $35 for your wheel?')).toBeUndefined();
  expect(text()).toContain('You approved this');
});

test("a payment with no fallback declines as Don't pay ahead", async () => {
  const decide = jest
    .spyOn(api, 'decideApproval')
    .mockResolvedValue({ ...approval(), status: 'declined' });
  const { press } = await render(
    React.createElement(ApprovalSheet, { approval: { ...approval(), fallback: '' } }),
  );
  await press('Review: OK $35 for your wheel?');
  await press("Don't pay ahead");
  expect(decide).toHaveBeenCalledWith('ap_0001', 'decline');
});
