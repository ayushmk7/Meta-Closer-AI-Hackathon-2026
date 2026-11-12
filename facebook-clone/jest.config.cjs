module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['<rootDir>/tests/native/**/*.test.cjs'],
  transform: {
    '^.+\\.(js|ts|tsx)$': ['babel-jest', { presets: ['module:@react-native/babel-preset'] }],
  },
};
