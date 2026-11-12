const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const vulnerableDecoder = require.resolve('decode-uri-component');
const safeDecoder = path.join(__dirname, 'src/platform/decode-uri-component.cjs');

// shortcut: SDK 57 pins a vulnerable decoder; remove with a compatible patched Expo upgrade.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = context.resolveRequest(context, moduleName, platform);
  if (resolution.type === 'sourceFile' && resolution.filePath === vulnerableDecoder) {
    return { type: 'sourceFile', filePath: safeDecoder };
  }
  return resolution;
};

module.exports = config;
