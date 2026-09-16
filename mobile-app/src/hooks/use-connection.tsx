import { useEmbeddedEthereumWallet, useLinkWithSiwe, useLoginWithEmail, useLoginWithSiwe, usePrivy } from '@privy-io/expo';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { CHAIN_CAIP2, connectMetaMask } from '@/lib/wallet-connect';

export type OtpStage = 'idle' | 'sending' | 'awaiting-code' | 'verifying' | 'error';
export type MetaMaskStage = 'idle' | 'connecting' | 'awaiting-signature' | 'linking' | 'error';
export type ActiveWallet = 'embedded' | 'metamask';

// expo-secure-store has no web implementation; same fallback shim used elsewhere in the app.
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return window.localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') return window.localStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
};

const ACTIVE_WALLET_KEY = 'veris.wallet.active';

// Privy checks this against "Allowed Origins" under Dashboard → App settings → Domains
// (overridable per app-client) — a real website-style domain, same as Privy's own SIWE
// docs example (`my-domain.com` / `https://my-domain.com`). Not the Mobile tab's app
// identifier/URL scheme fields — those are unrelated to SIWE domain validation.
const SIWE_ORIGIN = { domain: 'veris.live', uri: 'https://veris.live' };

type ConnectionState = {
  /** undefined while Privy is still initializing/restoring a session. */
  connected: boolean | undefined;
  /** The address currently acting as "you" across the app — either the embedded or linked MetaMask wallet. */
  address: string;
  embeddedAddress: string;
  metamaskAddress: string;
  activeWallet: ActiveWallet;
  setActiveWallet: (wallet: ActiveWallet) => void;
  otpStage: OtpStage;
  otpError: string | null;
  sendCode: (email: string) => Promise<boolean>;
  verifyCode: (email: string, code: string) => Promise<boolean>;
  metamaskStage: MetaMaskStage;
  metamaskError: string | null;
  /** For an already-logged-in user: attaches MetaMask as an extra wallet on the account. */
  connectMetaMaskWallet: () => Promise<void>;
  /** For a signed-out user: logs straight in with MetaMask, no email step at all. */
  loginWithMetaMaskWallet: () => Promise<void>;
  disconnect: () => void;
};

const ConnectionContext = createContext<ConnectionState | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const { user, isReady, logout } = usePrivy();
  const { sendCode: privySendCode, loginWithCode } = useLoginWithEmail();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const { generateSiweMessage: generateLinkSiweMessage, linkWithSiwe } = useLinkWithSiwe();
  const { generateSiweMessage: generateLoginSiweMessage, loginWithSiwe } = useLoginWithSiwe();
  const [otpStage, setOtpStage] = useState<OtpStage>('idle');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [metamaskStage, setMetamaskStage] = useState<MetaMaskStage>('idle');
  const [metamaskError, setMetamaskError] = useState<string | null>(null);
  const [activeWalletPref, setActiveWalletPref] = useState<ActiveWallet | null>(null);

  // A logged-in user needs a real embedded wallet to have an address at all — create one
  // the first time we see a user with none yet (e.g. right after their first login).
  useEffect(() => {
    if (user && wallets.length === 0) {
      create().catch(() => {
        // Swallow — a stale in-flight create() on remount is harmless, and any real
        // failure just leaves address empty, which every consumer already treats as "no wallet yet".
      });
    }
  }, [user, wallets.length, create]);

  useEffect(() => {
    let cancelled = false;
    storage.get(ACTIVE_WALLET_KEY).then((raw) => {
      if (!cancelled && (raw === 'embedded' || raw === 'metamask')) setActiveWalletPref(raw);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const embeddedAddress = wallets[0]?.address ?? '';

  // Real linked accounts from Privy — an external EVM wallet (MetaMask via WalletConnect) shows up
  // here as `type: 'wallet'`, `chain_type: 'ethereum'` with a connector_type other than 'embedded'.
  const metamaskAddress = useMemo(() => {
    const linked = user?.linked_accounts?.find(
      (a): a is Extract<typeof a, { type: 'wallet'; chain_type: 'ethereum' }> =>
        a.type === 'wallet' && 'chain_type' in a && a.chain_type === 'ethereum' && a.connector_type !== 'embedded'
    );
    return linked?.address ?? '';
  }, [user?.linked_accounts]);

  const setActiveWallet = useCallback((wallet: ActiveWallet) => {
    setActiveWalletPref(wallet);
    storage.set(ACTIVE_WALLET_KEY, wallet).catch(() => {});
  }, []);

  // Default to whichever wallet the user hasn't explicitly picked yet: prefer a linked MetaMask
  // once one exists (that's the whole point of linking it), otherwise fall back to the embedded one.
  const activeWallet: ActiveWallet = activeWalletPref ?? (metamaskAddress ? 'metamask' : 'embedded');
  const address = activeWallet === 'metamask' && metamaskAddress ? metamaskAddress : embeddedAddress;

  const sendCode = useCallback(
    async (email: string) => {
      setOtpError(null);
      setOtpStage('sending');
      try {
        await privySendCode({ email });
        setOtpStage('awaiting-code');
        return true;
      } catch (err) {
        setOtpError(err instanceof Error ? err.message : 'Could not send a code to that address.');
        setOtpStage('error');
        return false;
      }
    },
    [privySendCode]
  );

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      setOtpError(null);
      setOtpStage('verifying');
      try {
        const loggedInUser = await loginWithCode({ code, email });
        if (!loggedInUser) throw new Error('Incorrect code.');
        setOtpStage('idle');
        return true;
      } catch (err) {
        setOtpError(err instanceof Error ? err.message : 'Incorrect code.');
        setOtpStage('error');
        return false;
      }
    },
    [loginWithCode]
  );

  const connectMetaMaskWallet = useCallback(async () => {
    setMetamaskError(null);
    setMetamaskStage('connecting');
    try {
      const conn = await connectMetaMask();
      setMetamaskStage('awaiting-signature');
      const message = await generateLinkSiweMessage({
        wallet: { address: conn.address, chainId: CHAIN_CAIP2, walletClientType: 'metamask', connectorType: 'wallet_connect' },
        from: SIWE_ORIGIN,
      });
      const signature = await conn.signMessage(message);
      setMetamaskStage('linking');
      await linkWithSiwe({ signature });
      setActiveWallet('metamask');
      setMetamaskStage('idle');
    } catch (err) {
      setMetamaskError(err instanceof Error ? err.message : 'Could not connect MetaMask.');
      setMetamaskStage('error');
    }
  }, [generateLinkSiweMessage, linkWithSiwe, setActiveWallet]);

  const loginWithMetaMaskWallet = useCallback(async () => {
    setMetamaskError(null);
    setMetamaskStage('connecting');
    try {
      const conn = await connectMetaMask();
      setMetamaskStage('awaiting-signature');
      const message = await generateLoginSiweMessage({
        wallet: { address: conn.address, chainId: CHAIN_CAIP2, walletClientType: 'metamask', connectorType: 'wallet_connect' },
        from: SIWE_ORIGIN,
      });
      const signature = await conn.signMessage(message);
      setMetamaskStage('linking');
      await loginWithSiwe({ signature });
      setActiveWallet('metamask');
      setMetamaskStage('idle');
    } catch (err) {
      setMetamaskError(err instanceof Error ? err.message : 'Could not connect MetaMask.');
      setMetamaskStage('error');
    }
  }, [generateLoginSiweMessage, loginWithSiwe, setActiveWallet]);

  const disconnect = useCallback(() => {
    logout().catch(() => {});
    setOtpStage('idle');
    setOtpError(null);
    setMetamaskStage('idle');
    setMetamaskError(null);
  }, [logout]);

  const value = useMemo<ConnectionState>(
    () => ({
      connected: !isReady ? undefined : !!user,
      address,
      embeddedAddress,
      metamaskAddress,
      activeWallet,
      setActiveWallet,
      otpStage,
      otpError,
      sendCode,
      verifyCode,
      metamaskStage,
      metamaskError,
      connectMetaMaskWallet,
      loginWithMetaMaskWallet,
      disconnect,
    }),
    [
      isReady,
      user,
      address,
      embeddedAddress,
      metamaskAddress,
      activeWallet,
      setActiveWallet,
      otpStage,
      otpError,
      sendCode,
      verifyCode,
      metamaskStage,
      metamaskError,
      connectMetaMaskWallet,
      loginWithMetaMaskWallet,
      disconnect,
    ]
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used within a ConnectionProvider');
  return ctx;
}
