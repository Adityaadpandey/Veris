import { useRouter } from 'expo-router';

import { SearchScreen } from '@/screens/search-screen';
import { useConnection } from '@/hooks/use-connection';

export default function PublicSearchRoute() {
  const router = useRouter();
  const { connected } = useConnection();

  return (
    <SearchScreen
      onLeave={() => (connected ? router.replace('/portal') : router.back())}
      onOpenRealClaim={(claimId) => router.push({ pathname: '/claim/real/[claimId]', params: { claimId } })}
    />
  );
}
