/* eslint-disable @typescript-eslint/no-require-imports -- Jest mocks load synchronously. */
// Jest stand-in for react-native-reanimated (its real build is ESM and its own mock imports it).
// Use: jest.mock('react-native-reanimated', () => require('./reanimated.cjs'));
// Set global.__reduceMotion = true to exercise the reduce-motion paths.
const { View } = require('react-native');
const builder = {};
for (const k of ['duration', 'delay', 'easing', 'withInitialValues', 'springify'])
  builder[k] = () => builder;
const same = (v) => v;
module.exports = {
  __esModule: true,
  default: { View, createAnimatedComponent: same },
  FadeInDown: builder,
  Easing: { out: same, quad: same },
  useReducedMotion: () => global.__reduceMotion === true,
  useSharedValue: (value) => ({ value }),
  useAnimatedStyle: (f) => f(),
  withTiming: same,
  withSpring: same,
  withRepeat: same,
  cancelAnimation: () => {},
};
