/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockParams = { meetupId: 'mt_0001' };
jest.mock('expo-linking', () => ({ createURL: (p) => `app://${p}` }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 1, longitude: 2 } })),
}));
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

const { Alert, Linking } = require('react-native');
const Location = require('expo-location');
const Meetup = require('../../src/features/common-ground/Meetup').default;

// Confirmed and happening now, so day-of and check-in show (mock config: relaxCheckin).
function confirmedNow() {
  const m = clone(F.getMeetup);
  m.status = 'confirmed';
  m.startsAt = new Date(Date.now() - 10 * 60_000).toISOString();
  m.endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
  return m;
}
function show(m) {
  jest.spyOn(api, 'getMeetup').mockResolvedValue(m);
  store.setState({ meetups: { [m.meetupId]: m } });
  return render(React.createElement(Meetup));
}

test('header, steps with the inline approval, attendees and details render', async () => {
  const { text, byLabel } = await show(clone(F.getMeetup));
  expect(text()).toContain('Wheel-throwing drop-in');
  expect(text()).toContain('Muse is setting this up');
  expect(byLabel('Opened your group chat, done')).toBeTruthy();
  expect(byLabel('Waiting for you to OK $35, needs you')).toBeTruthy();
  expect(byLabel('Review: OK $35 for your wheel?')).toBeTruthy();
  expect(text()).toContain('Wheel throwing');
  expect(text()).toContain('22 min by transit');
  expect(text()).not.toContain('Simulated booking');
  expect(byLabel('Coming soon: Muse will soon call venues to book for you')).toBeTruthy();
  // Not day of: no status buttons, no check-in.
  expect(byLabel('On my way')).toBeUndefined();
  expect(byLabel('Check in')).toBeUndefined();
});

test('C2: rendering never reads location; check-in sends the demo fake location', async () => {
  const check = jest.spyOn(api, 'checkIn').mockResolvedValue({ accepted: true });
  const { press } = await show(confirmedNow());
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  await press('Check in');
  expect(check).toHaveBeenCalledWith('mt_0001', F.getConfig.demo.fakeLocation);
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

test('C2: without a fake location, the only reading happens on the Check in tap', async () => {
  const config = store.getState().config;
  store.setState({ config: { ...config, demo: { ...config.demo, fakeLocation: null } } });
  const check = jest
    .spyOn(api, 'checkIn')
    .mockResolvedValue({ accepted: false, reason: 'outside_geofence' });
  const { press, text } = await show(confirmedNow());
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  await press('Check in');
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  expect(check).toHaveBeenCalledWith('mt_0001', { lat: 1, lng: 2 });
  expect(text()).toContain("You don't seem to be at the venue yet.");
  await renderer.act(async () => store.setState({ config }));
});

test('Directions opens the server URL with Linking', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const { press } = await show(clone(F.getMeetup));
  await press('Directions');
  const buttons = alert.mock.calls[0][2];
  buttons.find((b) => b.text === 'Apple Maps').onPress();
  expect(open).toHaveBeenCalledWith(F.getMeetup.travel.directions.apple);
  buttons.find((b) => b.text === 'Google Maps').onPress();
  expect(open).toHaveBeenCalledWith(F.getMeetup.travel.directions.google);
});

test('day of: On my way calls setMeetupStatus', async () => {
  const m = confirmedNow();
  const set = jest.spyOn(api, 'setMeetupStatus').mockResolvedValue(m);
  const { press, text } = await show(m);
  expect(text()).toContain('Muse set this up');
  await press('On my way');
  expect(set).toHaveBeenCalledWith('mt_0001', 'on_my_way');
});

test("Ask Muse prefills 'Muse, ' and Can't make it confirms before leaving", async () => {
  const { router } = require('expo-router');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const leave = jest.spyOn(api, 'leaveMeetup').mockResolvedValue(clone(F.getMeetup));
  const { press } = await show(clone(F.getMeetup));
  await press('Ask Muse to change it');
  expect(store.getState().drafts.th_0001).toBe('Muse, ');
  expect(router.push).toHaveBeenCalledWith('/common-ground/chat/th_0001');
  await press("Can't make it");
  expect(leave).not.toHaveBeenCalled();
  await renderer.act(async () =>
    alert.mock.calls[0][2].find((b) => b.style === 'destructive').onPress(),
  );
  expect(leave).toHaveBeenCalledWith('mt_0001');
});

test('feedback needs every answer before Send', async () => {
  const m = clone(F.getMeetup);
  m.feedbackDue = true;
  const send = jest.spyOn(api, 'sendFeedback').mockResolvedValue(undefined);
  const { press, byLabel } = await show(m);
  expect(byLabel('Send feedback').props.accessibilityState.disabled).toBe(true);
  for (const name of ['Daniel', 'Rosa']) {
    await press(`Did ${name} show up? Yes`);
    await press(`Would you meet ${name} again? No`);
  }
  await press('Send feedback');
  expect(send).toHaveBeenCalledWith('mt_0001', {
    answers: [
      { userId: 'u_0042', showedUp: true, meetAgain: false },
      { userId: 'u_0117', showedUp: true, meetAgain: false },
    ],
  });
});

test('a confirmed meetup still shows an approval its needs_you step links to', async () => {
  const m = confirmedNow();
  m.museSteps.forEach((s) => (s.status = 'done'));
  m.museSteps.push({
    stepId: 'st_c',
    kind: 'reschedule',
    status: 'needs_you',
    label: 'Move to 7 PM?',
    approvalId: 'ap_c',
    at: m.museSteps[0].at,
  });
  m.approvals = [{ ...m.approvals[0], approvalId: 'ap_c', kind: 'change', title: 'Move to 7 PM?' }];
  const { byLabel } = await show(m);
  expect(byLabel('Review: Move to 7 PM?')).toBeTruthy();
});

test('a cancelled meetup shows no day-of actions', async () => {
  const m = confirmedNow();
  m.status = 'cancelled';
  m.checkinWindow = { opensAt: m.startsAt, closesAt: m.endsAt };
  const { byLabel, text } = await show(m);
  expect(text()).toContain('This meetup was cancelled');
  expect(byLabel('Coming soon: Muse will soon call venues to book for you')).toBeUndefined();
  expect(byLabel('On my way')).toBeUndefined();
  expect(byLabel('Check in')).toBeUndefined();
});

test('steps added after confirmation re-open the collapsed timeline', async () => {
  const m = confirmedNow();
  m.museSteps.forEach((s) => (s.status = 'done'));
  const { byLabel } = await show(m);
  expect(byLabel('Opened your group chat, done')).toBeUndefined();
  const next = clone(m);
  next.museSteps.push({
    stepId: 'st_r',
    kind: 'reschedule',
    status: 'running',
    label: 'Moving to 11',
    at: m.museSteps[0].at,
  });
  await renderer.act(async () => store.setState({ meetups: { [m.meetupId]: next } }));
  expect(byLabel('Moving to 11, in progress')).toBeTruthy();
});

test('the day-of section is titled by weekday when it is not today', async () => {
  const m = confirmedNow();
  m.startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
  m.endsAt = new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString();
  const { text } = await show(m);
  const weekday = new Date(m.startsAt).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'America/Los_Angeles',
  });
  expect(text()).toContain(`"${weekday}"`);
  expect(text()).not.toContain('"Today"');
});

test('the header does not repeat the count when eventLabel carries it', async () => {
  const m = clone(F.getMeetup);
  m.eventLabel = 'Private event · 3 going';
  const { text } = await show(m);
  // Visible text only (the avatar row's accessibilityLabel keeps the count for VoiceOver).
  expect(text().match(/"children":\[[^\]]*3 going/g)).toHaveLength(1);
});

test('feedback: Yes/No as selected pills, a hint until complete, then a thank-you', async () => {
  const m = clone(F.getMeetup);
  m.feedbackDue = true;
  jest.spyOn(api, 'sendFeedback').mockResolvedValue(undefined);
  const { press, tree, text } = await show(m);
  expect(text()).toContain('Answer for Daniel and Rosa to send.');
  await press('Did Daniel show up? Yes');
  const yes = tree.root.find(
    (n) => n.props.accessibilityLabel === 'Did Daniel show up? Yes' && n.props.accessibilityState,
  );
  expect(yes.props.accessibilityState.selected).toBe(true);
  await press('Would you meet Daniel again? Yes');
  expect(text()).toContain('Answer for Rosa to send.');
  await press('Did Rosa show up? Yes');
  await press('Would you meet Rosa again? No');
  expect(text()).not.toContain('Answer for');
  await press('Send feedback');
  expect(text()).toContain('Thanks. Feedback sent.');
  expect(text()).not.toContain('How did it go?');
});

test('confirmed: a summary row replaces the collapsed steps; chat sits under the header', async () => {
  const m = confirmedNow();
  m.museSteps.forEach((s) => (s.status = 'done'));
  m.booking.status = 'booked';
  m.cost.myPayment = 'paid';
  m.calendar.desired = 'event';
  m.checkinWindow = null;
  const config = store.getState().config;
  store.setState({ config: { ...config, demo: { ...config.demo, relaxCheckin: false } } });
  const { byLabel } = await show(m);
  expect(byLabel('Booked, paid and on your calendar, done')).toBeTruthy();
  expect(byLabel('Open group chat').props.accessibilityState.disabled).toBe(false);
  await renderer.act(async () => store.setState({ config }));
});

test('a pending approval keeps Open group chat secondary (Review payment is the primary)', async () => {
  const { tree } = await show(clone(F.getMeetup));
  const chat = tree.root.find(
    (n) => n.props.accessibilityLabel === 'Open group chat' && typeof n.type === 'string',
  );
  expect(JSON.stringify(chat.props.style)).toContain('#F0F2F5'); // c.input = secondary fill
});

test('photo hero; the address is the Directions link; approval sheet says Approve payment', async () => {
  const { tree, byLabel, press, text } = await show(clone(F.getMeetup));
  expect(tree.root.findAll((n) => n.type === 'Image').length).toBeGreaterThan(0);
  expect(tree.root.findAll((n) => n.type === 'MapView')).toHaveLength(0);
  expect(byLabel('Directions').props.accessibilityHint).toBe('Hayes St, San Francisco');
  await press('Review: OK $35 for your wheel?');
  expect(text()).toContain('Approve payment');
});

test('web: the address is the same Directions link and opens Google Maps directly', async () => {
  const { Platform } = require('react-native');
  const os = Platform.OS;
  Platform.OS = 'web';
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const { press } = await show(clone(F.getMeetup));
    await press('Directions');
    expect(alert).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(F.getMeetup.travel.directions.google);
  } finally {
    Platform.OS = os;
  }
});
