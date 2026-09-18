// Polyfills required by @privy-io/expo (viem + embedded wallet crypto) — must
// load before anything else touches those APIs, hence this custom entry
// point instead of pointing "main" straight at expo-router/entry.
import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@ethersproject/shims';

import 'expo-router/entry';
