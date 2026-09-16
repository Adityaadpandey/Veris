import { useRouter } from 'expo-router';

import { SearchScreen } from '@/screens/search-screen';

export default function PrivateSearchRoute() {
  const router = useRouter();

  return (
    <SearchScreen
      onLeave={() => router.replace('/portal')}
      onOpenRealClaim={(claimId) => router.push({ pathname: '/claim/real/[claimId]', params: { claimId } })}
    />
  );
}
