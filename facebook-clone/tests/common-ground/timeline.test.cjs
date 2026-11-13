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

const StepTimeline = require('../../src/features/common-ground/StepTimeline').default;
const step = (stepId, status, kind = 'book', extra = {}) => ({
  stepId,
  kind,
  status,
  label: `Step ${stepId}`,
  detail: null,
  approvalId: null,
  at: '2026-11-12T18:12:00Z',
  ...extra,
});

test('every status reads label + status; unknown kind and status still render', async () => {
  const steps = [
    step('a', 'queued'),
    step('b', 'running'),
    step('c', 'done', 'group_chat', { detail: 'Checked 3 calendars' }),
    step('d', 'needs_you', 'payment'),
    step('e', 'failed'),
    step('f', 'skipped'),
    step('g', 'teleporting', 'quantum_tunnel'),
  ];
  const { byLabel, text } = await render(
    React.createElement(StepTimeline, { meetupId: 'mt_none', steps }),
  );
  for (const [id, word] of [
    ['a', 'queued'],
    ['b', 'in progress'],
    ['c', 'done'],
    ['d', 'needs you'],
    ['e', 'failed'],
    ['f', 'skipped'],
    ['g', 'teleporting'],
  ])
    expect(byLabel(`Step ${id}, ${word}`)).toBeTruthy();
  expect(text()).toContain('Checked 3 calendars');
  expect(text()).toContain('Needs you');
});

test('a needs_you step with my pending approval shows the approval inline', async () => {
  const m = clone(F.getMeetup);
  store.setState({ meetups: { [m.meetupId]: m } });
  const { byLabel, text } = await render(
    React.createElement(StepTimeline, { meetupId: m.meetupId, steps: m.museSteps }),
  );
  expect(byLabel('Review: OK $35 for your wheel?')).toBeTruthy();
  expect(text()).toContain('Hayes Clay Studio');
});

test('an approval that is no longer pending is not shown inline', async () => {
  const m = clone(F.getMeetup);
  m.approvals[0].status = 'approved';
  store.setState({ meetups: { [m.meetupId]: m } });
  const { byLabel } = await render(
    React.createElement(StepTimeline, { meetupId: m.meetupId, steps: m.museSteps }),
  );
  expect(byLabel('Review: OK $35 for your wheel?')).toBeUndefined();
});

test('a step already done on open stays still; a live flip to done pops', async () => {
  const popped = () => text().includes('"scale"');
  const { tree, text } = await render(
    React.createElement(StepTimeline, { meetupId: 'mt_none', steps: [step('a', 'done')] }),
  );
  expect(popped()).toBe(false);
  const el = (status) =>
    React.createElement(StepTimeline, { meetupId: 'mt_none', steps: [step('b', status)] });
  await renderer.act(async () => tree.update(el('running')));
  await renderer.act(async () => tree.update(el('done')));
  expect(popped()).toBe(true);
});

const table = (status = 'done') =>
  step('bk', status, 'book', { label: 'Reserved a table for 4 at Little Fern Kitchen · 7 PM' });

test('a restaurant booking step plays the call once, then shows the reserved check', async () => {
  jest.useFakeTimers();
  try {
    const { text, byLabel } = await render(
      React.createElement(StepTimeline, { meetupId: 'mt_call', steps: [table()] }),
    );
    expect(byLabel('Muse is calling Little Fern Kitchen')).toBeTruthy();
    expect(text()).toContain('Calling Little Fern Kitchen…');
    expect(text()).not.toContain('how can I help');
    await renderer.act(async () => jest.advanceTimersByTime(1300));
    expect(text()).toContain('Little Fern Kitchen, how can I help?');
    await renderer.act(async () => jest.advanceTimersByTime(5000));
    expect(text()).toContain("Hi, I'm Muse, an AI assistant.");
    expect(byLabel('Muse called Little Fern Kitchen. Reserved · table for 4 · 7 PM')).toBeTruthy();
    expect(byLabel('Reserved a table for 4 at Little Fern Kitchen · 7 PM, done')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
  // Second open of the same meetup: just the normal row.
  const again = await render(
    React.createElement(StepTimeline, { meetupId: 'mt_call', steps: [table()] }),
  );
  expect(again.text()).not.toContain('Calling');
  expect(again.byLabel('Reserved a table for 4 at Little Fern Kitchen · 7 PM, done')).toBeTruthy();
});

test('a non-restaurant booking step gets no call card', async () => {
  const s = step('bk', 'done', 'book', { label: 'Booked 3 wheels at Clay Hour Studio' });
  const { text } = await render(
    React.createElement(StepTimeline, { meetupId: 'mt_wheels', steps: [s] }),
  );
  expect(text()).not.toContain('Calling');
  expect(text()).not.toContain('Muse called');
});

test('reduce motion shows the finished call at once', async () => {
  global.__reduceMotion = true;
  try {
    const { text, byLabel } = await render(
      React.createElement(StepTimeline, { meetupId: 'mt_calm', steps: [table()] }),
    );
    expect(byLabel('Muse called Little Fern Kitchen. Reserved · table for 4 · 7 PM')).toBeTruthy();
    expect(text()).toContain('Thank you!');
  } finally {
    global.__reduceMotion = false;
  }
});
