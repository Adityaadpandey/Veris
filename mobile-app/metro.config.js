const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// jose (pulled in by @privy-io/js-sdk-core) has no "react-native" export
// condition, so Metro's default condition set falls through to its Node
// build (which imports Node's `util`/`zlib`) instead of the browser build it
// does publish. Adding "browser" to the requested conditions makes Metro
// match jose's browser export first, same fix used across the wagmi/viem/
// Privy React Native ecosystem for this exact failure.
config.resolver.unstable_conditionNames = ['browser', 'react-native', 'require'];

module.exports = config;
