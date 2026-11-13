/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockParams = { threadId: 'th_0001' };
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

const Chat = require('../../src/features/common-ground/Chat');
const msgs = () => [
  ...clone(F.listMessages.items),
  {
    messageId: 'ms_x',
    threadId: 'th_0001',
    sender: { kind: 'robot', userId: null },
    text: 'from the future',
    createdAt: '2026-11-12T18:15:00Z',
    attachments: [{ kind: 'hologram', blob: 1 }],
  },
];
function show(list = msgs()) {
  jest.spyOn(api, 'listMessages').mockResolvedValue(list);
  jest.spyOn(api, 'markThreadRead').mockResolvedValue(undefined);
  jest.spyOn(api, 'getMeetup').mockResolvedValue(clone(F.getMeetup));
  store.setState({ messages: { th_0001: list }, drafts: {} });
  return render(React.createElement(Chat.default));
}

test('Muse card, starters, meetup card; unknown sender and attachment kinds do not throw', async () => {
  const { text } = await show();
  expect(text()).toContain('Muse');
  expect(text()).toContain('meet each other');
  expect(text()).toContain('Mugs or bowls?');
  expect(text()).toContain('Hayes Clay Studio');
  expect(text()).toContain('from the future');
  expect(text()).not.toContain('hologram');
});

test('a starter fills the composer; Ask Muse sends toMuse and resets', async () => {
  const send = jest
    .spyOn(api, 'sendMessage')
    .mockImplementation(async (threadId, text, clientId, toMuse) => ({
      messageId: 'ms_new',
      threadId,
      sender: { kind: 'user', userId: 'u_maya' },
      text,
      createdAt: new Date().toISOString(),
      clientId,
      toMuse,
      attachments: [],
    }));
  const { tree, press, byLabel } = await show();
  const [starter] = tree.root.findAll(
    (n) =>
      n.props.accessibilityLabel === 'What was the first thing you ever made on a wheel?' &&
      n.props.onPress,
  );
  await renderer.act(async () => starter.props.onPress());
  expect(byLabel('Message').props.value).toBe('What was the first thing you ever made on a wheel?');
  await press('Ask Muse');
  expect(byLabel('Message to Muse')).toBeTruthy();
  await press('Send message');
  expect(send).toHaveBeenCalledWith(
    'th_0001',
    'What was the first thing you ever made on a wheel?',
    expect.any(String),
    true,
  );
  expect(byLabel('Message')).toBeTruthy();
  // Muse's typing bubble shows until Muse replies.
  expect(byLabel('Muse is on it…')).toBeTruthy();
});

test("muse_steps attachment lists those steps; 'Muse is on it…' until Muse replies", async () => {
  const m = clone(F.getMeetup);
  m.museSteps.push(
    {
      stepId: 'st_0008',
      kind: 'reschedule',
      status: 'done',
      label: 'Moved to 11',
      at: m.museSteps[0].at,
    },
    {
      stepId: 'st_0009',
      kind: 'calendar',
      status: 'running',
      label: 'Updating calendars',
      at: m.museSteps[0].at,
    },
  );
  store.setState({ meetups: { [m.meetupId]: m } });
  jest.spyOn(api, 'getMeetup').mockResolvedValue(m);
  const list = msgs().slice(0, 3);
  jest.spyOn(api, 'listMessages').mockResolvedValue(list);
  jest.spyOn(api, 'markThreadRead').mockResolvedValue(undefined);
  store.setState({ messages: { th_0001: list } });
  const { byLabel, text } = await render(React.createElement(Chat.default));
  expect(byLabel('Moved to 11, done')).toBeTruthy();
  expect(byLabel('Updating calendars, in progress')).toBeTruthy();
  expect(text()).not.toContain('Muse is on it');
  expect(byLabel('Muse is on it…')).toBeUndefined();

  const ask = { ...list[1], messageId: 'ms_4' };
  expect(Chat.museBusy([...list, ask])).toBe(true);
  expect(Chat.museBusy(list)).toBe(false);
  expect(Chat.museBusy([])).toBe(false);
});

test('header falls back to getThread; others get avatar + first name on the first bubble of a run', async () => {
  store.setState({ threads: [] });
  const thread = {
    threadId: 'th_0001',
    kind: 'group',
    title: 'Wheel-throwing drop-in',
    participants: F.getMeetup.attendees.map((a) => a.person),
    unreadCount: 0,
    updatedAt: '2026-11-12T18:14:16Z',
    meetupId: 'mt_0001',
  };
  const get = jest.spyOn(api, 'getThread').mockResolvedValue(thread);
  const daniel = { ...clone(F.listMessages.items[1]), toMuse: false };
  const list = [daniel, { ...daniel, messageId: 'ms_d2', text: 'Mugs too.' }];
  const { byLabel, text, tree } = await show(list);
  expect(get).toHaveBeenCalledWith('th_0001');
  expect(byLabel('Wheel-throwing drop-in, see meetup')).toBeTruthy();
  expect(text().match(/"Daniel"/g)).toHaveLength(1);
  expect(
    tree.root.findAll((n) => n.props.accessibilityLabel === 'Daniel Okafor').length,
  ).toBeGreaterThan(0);
});

test('opening a chat clears its unread count even when the thread list answers last', async () => {
  const t = {
    threadId: 'th_0001',
    kind: 'group',
    title: 'Wheel-throwing drop-in',
    participants: [],
    unreadCount: 2,
    updatedAt: '2026-11-12T18:14:16Z',
    meetupId: 'mt_0001',
  };
  let read = false;
  // The server snapshots unread when the list request arrives; its answer comes back last.
  jest.spyOn(api, 'listThreads').mockImplementation(() => {
    const snap = [{ ...t, unreadCount: read ? 0 : 2 }];
    return new Promise((r) => setTimeout(() => r(snap), 0));
  });
  jest.spyOn(api, 'listMessages').mockResolvedValue(msgs());
  jest.spyOn(api, 'markThreadRead').mockImplementation(async () => void (read = true));
  jest.spyOn(api, 'getMeetup').mockResolvedValue(clone(F.getMeetup));
  store.setState({ threads: [t], messages: { th_0001: msgs() }, drafts: {} });
  await render(React.createElement(Chat.default));
  await renderer.act(() => new Promise((r) => setTimeout(r, 5)));
  expect(store.getState().threads[0].unreadCount).toBe(0);
});

test('polls that return the same data do not re-render the open chat', async () => {
  let commits = 0;
  const list = msgs();
  store.setState({ messages: { th_0001: list }, drafts: {} });
  jest.spyOn(api, 'listMessages').mockImplementation(async () => clone(list));
  jest.spyOn(api, 'markThreadRead').mockResolvedValue(undefined);
  jest.spyOn(api, 'getMeetup').mockResolvedValue(clone(F.getMeetup));
  await render(
    React.createElement(React.Profiler, { id: 'chat', onRender: () => commits++ }, [
      React.createElement(Chat.default, { key: 'c' }),
    ]),
  );
  await renderer.act(() => new Promise((r) => setTimeout(r, 5)));
  const settled = commits;
  for (let i = 0; i < 5; i++) await renderer.act(() => store.load.messages('th_0001'));
  expect(commits - settled).toBe(0);
});
