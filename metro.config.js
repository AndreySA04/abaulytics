const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@noble/hashes/crypto' || moduleName === '@noble/hashes/crypto.js') {
    // Explicit browser shim: entropy for credentials comes from expo-crypto.
    return { type: 'sourceFile', filePath: path.join(path.dirname(require.resolve('@noble/hashes/sha256')), 'crypto.js') };
  }
  return resolveRequest ? resolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};
module.exports = withNativeWind(config, { input: './global.css' });
