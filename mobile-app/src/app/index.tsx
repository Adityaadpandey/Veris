import { Redirect } from 'expo-router';

import { useConnection } from '@/hooks/use-connection';
import { useDevice } from '@/hooks/use-device';

export default function Index() {
  const { connected } = useConnection();
  const { paired } = useDevice();

  // Still reading the persisted flags from secure storage — native splash stays up.
  if (connected === undefined) return null;
  if (!connected) return <Redirect href="/onboarding" />;
  // Wait for device to resolve too, so a Hotshoe owner never flashes /portal before bouncing to /monitor.
  if (paired === undefined) return null;

  return <Redirect href={paired === 'hotshoe' ? '/monitor' : '/portal'} />;
}