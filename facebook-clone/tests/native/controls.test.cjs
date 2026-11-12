/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../src/core/store', () => ({
  useDemo: () => ({ state: { settings: { theme: 'dark' } } }),
}));
jest.mock('../../src/data/media', () => ({ imageSource: () => 1 }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
const { Button, Chips } = require('../../src/ui/native');

test('native action exposes its disabled state and readable label in dark mode', async () => {
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(
      React.createElement(Button, { title: 'Confirm', disabled: true, onPress: jest.fn() }),
    );
  });
  const button = tree.toJSON();
  expect(button.props.accessibilityRole).toBe('button');
  expect(button.props.accessibilityLabel).toBe('Confirm');
  expect(button.props.accessibilityState.disabled).toBe(true);
  expect(JSON.stringify(button.children)).toContain('Confirm');
  await renderer.act(async () => tree.unmount());
});

test('native section chips announce the current section when selection changes', async () => {
  const change = jest.fn();
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(
      React.createElement(Chips, {
        items: ['Requests', 'All friends'],
        value: 'Requests',
        onChange: change,
      }),
    );
  });
  const buttons = () => {
    const result = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.props?.accessibilityRole === 'button') result.push(node);
      node.children?.forEach(visit);
    };
    visit(tree.toJSON());
    return result;
  };
  expect(buttons()[0].props.accessibilityState.selected).toBe(true);
  expect(buttons()[1].props.accessibilityState.selected).toBe(false);
  await renderer.act(async () =>
    tree.update(
      React.createElement(Chips, {
        items: ['Requests', 'All friends'],
        value: 'All friends',
        onChange: change,
      }),
    ),
  );
  expect(buttons()[0].props.accessibilityState.selected).toBe(false);
  expect(buttons()[1].props.accessibilityState.selected).toBe(true);
  await renderer.act(async () => tree.unmount());
});
