import { Linking } from 'react-native';
import { getAddress, toHex } from 'viem';

import { CHAIN_ID, WALLETCONNECT_PROJECT_ID } from '@/constants/config';

const CHAIN = `eip155:${CHAIN_ID}`;

/** CAIP-2 id for the chain the contracts are deployed on — reused wherever Privy wants a chainId. */
export const CHAIN_CAIP2 = CHAIN;

type SignClientModule = typeof import('@walletconnect/sign-client');
type SignClientInstance = Awaited<ReturnType<SignClientModule['SignClient']['init']>>;

let clientPromise: Promise<SignClientInstance> | null = null;

// Loaded lazily (only when someone actually taps "Connect MetaMask") instead of at app boot.
// This SDK pulls in native modules (async-storage, netinfo) through react-native-compat — if the
// installed dev client hasn't been rebuilt with them yet, that throws. Importing it eagerly from
// use-connection.tsx would take down the entire app's root layout; importing it lazily means a
// WalletConnect problem only ever fails the button press, caught by connectMetaMaskWallet's try/catch.
//
// Plain `require()` here on purpose, not dynamic `import()` — Metro treats `import()` as a real
// async chunk boundary, and that machinery breaks on WalletConnect's dependency tree ("Requiring
// unknown module"). A `require()` inside a function still only runs the first time this function
// is actually called, which is all the laziness we need, without Metro's async-bundle splitting.
async function getClient(): Promise<SignClientInstance> {
  if (!clientPromise) {
    clientPromise = (async () => {
      require('@walletconnect/react-native-compat');
      const { SignClient } = require('@walletconnect/sign-client') as SignClientModule;
      return SignClient.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: 'Veris',
          description: 'Hardware-verified photo NFTs',
          url: 'https://veris.live',
          icons: ['https://veris.live/icon.png'],
          redirect: { native: 'verishotshoeapp://' },
        },
      });
    })().catch((err) => {
      clientPromise = null; // let the next attempt retry instead of replaying a cached failure
      throw err;
    });
  }
  return clientPromise;
}

export type MetaMaskConnection = {
  address: string;
  /** Asks the same MetaMask session to sign a message — used once the SIWE message text is known. */
  signMessage: (message: string) => Promise<string>;
};

/**
 * Opens a real WalletConnect session with MetaMask and waits for the user to approve it there.
 * Doesn't sign anything yet — callers get the connected address back so they can build the exact
 * SIWE message Privy expects, then call `signMessage` on the returned connection.
 */
export async function connectMetaMask(): Promise<MetaMaskConnection> {
  const client = await getClient();

  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      eip155: {
        methods: ['personal_sign'],
        chains: [CHAIN],
        events: ['accountsChanged', 'chainChanged'],
      },
    },
  });

  if (!uri) throw new Error('Could not start a WalletConnect session.');

  const canOpenNative = await Linking.canOpenURL('metamask://').catch(() => false);
  const link = canOpenNative
    ? `metamask://wc?uri=${encodeURIComponent(uri)}`
    : `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;
  Linking.openURL(link).catch(() => {});

  const session = await approval();
  const account = session.namespaces.eip155?.accounts?.[0];
  if (!account) throw new Error('MetaMask did not return an account.');
  // WalletConnect/MetaMask hand this back lowercase; Privy's SIWE message needs the
  // EIP-55 checksummed form or its own signature verification rejects it as invalid.
  const address = getAddress(account.split(':')[2]);

  return {
    address,
    signMessage: (message: string) =>
      client.request<string>({
        topic: session.topic,
        chainId: CHAIN,
        request: { method: 'personal_sign', params: [toHex(message), address] },
      }),
  };
}
