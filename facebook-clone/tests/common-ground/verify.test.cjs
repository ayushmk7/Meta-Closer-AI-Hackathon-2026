/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockParams = { meetupId: 'mt_0001' };
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
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  FadeInDown: {},
}));
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  // Like the real hook: state that the request updates. `answer` is what the user taps.
  useCameraPermissions: () => {
    const [p, setP] = require('react').useState(mockPermission.initial);
    return [p, async () => (setP(mockPermission.answer), mockPermission.answer)];
  },
}));
const GRANTED = { granted: true, canAskAgain: true };
const mockPermission = { initial: { granted: false, canAskAgain: true }, answer: GRANTED };
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

const Scan = require('../../src/features/common-ground/Scan');
const ScanWeb = require('../../src/features/common-ground/Scan.web');
const VerifyButton = require('../../src/features/common-ground/VerifyButton').default;

function confirmed(extra = {}) {
  const m = clone(F.getMeetup);
  Object.assign(m, { status: 'confirmed', verifyCode: 'MAYA42' }, extra);
  jest.spyOn(api, 'getMeetup').mockResolvedValue(m);
  store.setState({ meetups: { [m.meetupId]: m } });
  return m;
}
const type = async (tree, value) => {
  const input = tree.root.find(
    (n) => n.props.accessibilityLabel === 'Their code' && n.props.onChangeText,
  );
  await renderer.act(async () => input.props.onChangeText(value));
};

test('VerifyButton: hidden without my code or before confirm; opens the scan route', async () => {
  const { router } = require('expo-router');
  const m = confirmed({ verifyCode: null });
  expect((await render(React.createElement(VerifyButton, { m }))).text()).toBe('null');
  const setting = { ...m, status: 'setting_up', verifyCode: 'MAYA42' };
  expect((await render(React.createElement(VerifyButton, { m: setting }))).text()).toBe('null');
  const { press, text } = await render(React.createElement(VerifyButton, { m: confirmed() }));
  expect(text()).toContain('Met in person');
  await press('Verify in person');
  expect(router.push).toHaveBeenCalledWith('/common-ground/scan/mt_0001');
});

test('VerifyButton: lists who I am verified with', async () => {
  const m = confirmed();
  m.attendees[0].verified = true;
  m.attendees[1].verified = true;
  const { byLabel } = await render(React.createElement(VerifyButton, { m }));
  expect(byLabel('Verified with Daniel')).toBeTruthy();
});

test('typed code: trimmed, upper-cased, sent once; accepted shows who', async () => {
  confirmed();
  const verify = jest.spyOn(api, 'verifyAttendee').mockResolvedValue({
    accepted: true,
    person: F.getMeetup.attendees[1].person,
  });
  const { tree, press, text } = await render(React.createElement(ScanWeb.default));
  expect(text()).toContain('MAYA42');
  expect(text()).not.toContain('CameraView');
  await type(tree, '  dan042 ');
  await press('Verify');
  expect(verify).toHaveBeenCalledTimes(1);
  expect(verify).toHaveBeenCalledWith('mt_0001', 'DAN042');
  expect(text()).toContain('You and Daniel are verified.');
  expect(text()).toContain('Back to the plan');
  // Done: no field, no Verify, so a second submit can't verify the next attendee.
  expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Their code')).toHaveLength(0);
  expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Verify')).toHaveLength(0);
});

test('rejected codes show the reason, unknown reasons a fallback', async () => {
  confirmed();
  const verify = jest
    .spyOn(api, 'verifyAttendee')
    .mockResolvedValue({ accepted: false, reason: 'self' });
  const { tree, press, text } = await render(React.createElement(ScanWeb.default));
  await type(tree, 'MAYA42');
  await press('Verify');
  expect(text()).toContain("That's your own code.");
  verify.mockResolvedValue({ accepted: false, reason: 'cosmic_rays' });
  await press('Verify');
  expect(text()).toContain("That code didn't work.");
});

test('native: QR grid, camera only after permission, repeated scans sent once', async () => {
  confirmed();
  const verify = jest
    .spyOn(api, 'verifyAttendee')
    .mockResolvedValue({ accepted: false, reason: 'not_attendee' });
  const { tree, press, text } = await render(React.createElement(Scan.default));
  const qr = tree.root.find((n) => n.props.accessibilityLabel === 'QR code of your code');
  const n = qr.props.children.length;
  expect(n).toBeGreaterThanOrEqual(21); // version 1 QR is 21x21
  expect(qr.props.children[0].props.children.length).toBe(n);
  expect(text()).not.toContain('CameraView');
  await press('Open camera');
  const cam = tree.root.find((x) => x.type === 'CameraView');
  await renderer.act(async () => {
    cam.props.onBarcodeScanned({ data: 'DAN042' });
    cam.props.onBarcodeScanned({ data: 'DAN042' });
  });
  expect(verify).toHaveBeenCalledTimes(1);
  expect(text()).toContain("That person isn't on this plan.");
});

test('no code for this plan shows not found', async () => {
  confirmed({ verifyCode: null });
  const { text } = await render(React.createElement(ScanWeb.default));
  expect(text()).toContain("This code isn't available");
});

test('native: a denied camera stays closed and points to typed entry', async () => {
  confirmed();
  mockPermission.answer = { granted: false, canAskAgain: false };
  const { tree, press, text, byLabel } = await render(React.createElement(Scan.default));
  await press('Open camera');
  expect(tree.root.findAll((x) => x.type === 'CameraView')).toHaveLength(0);
  expect(text()).toContain('Camera is off for this app. Type their code below instead.');
  expect(byLabel('Their code')).toBeTruthy();
  mockPermission.answer = GRANTED;
});
