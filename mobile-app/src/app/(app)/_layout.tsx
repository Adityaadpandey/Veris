import { Redirect, Slot, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Dock, type DockTab } from '@/components/dock';
import { PairingModal } from '@/components/pairing-modal';
import { Palette } from '@/constants/theme';
import { useConnection } from '@/hooks/use-connection';
import { useDevice } from '@/hooks/use-device';
import { useDigilocker } from '@/hooks/use-digilocker';

function tabFromPathname(pathname: string): DockTab {
  if (pathname.includes('capture')) return 'capture';
  if (pathname.includes('search')) return 'search';
  if (pathname.includes('monitor')) return 'monitor';
  return 'portal';
}

export default function AppGroupLayout() {
  const { connected } = useConnection();
  const { verified } = useDigilocker();
  const { paired, pairingSeen, promptVisible, openPrompt, closePrompt, pair, skip } = useDevice();
  const pathname = usePathname();
  const router = useRouter();

  // Once identity + wallet are both set up, offer to pair a Hotshoe or Clip — once.
  useEffect(() => {
    if (connected && verified && paired === null && pairingSeen === false && !promptVisible) {
      openPrompt();
    }
  }, [connected, verified, paired, pairingSeen, promptVisible, openPrompt]);

  // A connected wallet is only meaningful once it's tied to a verified identity —
  // if either drops (e.g. DigiLocker was disconnected from profile), the whole
  // session is unauthenticated, not just half of it.
  if (connected === undefined || verified === undefined) return null;
  if (!connected || !verified) return <Redirect href="/landing" />;

  const hasClip = paired === 'clip';
  const hasHotshoe = paired === 'hotshoe';
  // Profile is a detail screen reached from the archive header, not a navbar tab — keep the dock off it.
  // Capture is a full-screen camera UI with its own chrome — the dock would overlap its bottom controls.
  const showDock = !pathname.includes('/profile') && !pathname.includes('/capture');

  const goTab = (tab: DockTab) => {
    if (tab === 'portal') router.replace('/portal');
    else if (tab === 'search') router.replace('/search');
    else if (tab === 'monitor') router.replace('/monitor');
    else router.replace('/capture');
  };

  const handleSkip = () => {
    skip();
    closePrompt();
  };

  return (
    <View style={styles.fill}>
      <Slot />
      {showDock && (
        <Dock active={tabFromPathname(pathname)} showCapture={hasClip} showMonitor={hasHotshoe} onChange={goTab} />
      )}
      <PairingModal visible={promptVisible} onSelect={pair} onSkip={handleSkip} onDone={closePrompt} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Palette.cream },
});
