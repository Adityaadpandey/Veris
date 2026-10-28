import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  useFonts as useArchivo,
} from '@expo-google-fonts/archivo';
import { ArchivoBlack_400Regular, useFonts as useArchivoBlack } from '@expo-google-fonts/archivo-black';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  useFonts as useIBMPlexMono,
} from '@expo-google-fonts/ibm-plex-mono';
import { PrivyProvider } from '@privy-io/expo';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Palette } from '@/constants/theme';
import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from '@/constants/config';
import { ConnectionProvider } from '@/hooks/use-connection';
import { DeviceProvider } from '@/hooks/use-device';
import { DigilockerProvider } from '@/hooks/use-digilocker';
import { PhotosProvider } from '@/hooks/use-photos';
import { PiTriggerProvider } from '@/hooks/use-pi-trigger';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [archivoLoaded] = useArchivo({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
  });
  const [archivoBlackLoaded] = useArchivoBlack({ ArchivoBlack_400Regular });
  const [monoLoaded] = useIBMPlexMono({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  const fontsReady = archivoLoaded && archivoBlackLoaded && monoLoaded;

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync();
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Palette.paper }}>
      <PrivyProvider appId={PRIVY_APP_ID} clientId={PRIVY_CLIENT_ID}>
        <DigilockerProvider>
          <ConnectionProvider>
            <DeviceProvider>
              <PhotosProvider>
                <PiTriggerProvider>
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Palette.paper } }}>
                    <Stack.Screen name="digilocker" />
                    <Stack.Screen name="wallet" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="pairing" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="trigger" options={{ presentation: 'modal' }} />
                  </Stack>
                </PiTriggerProvider>
              </PhotosProvider>
            </DeviceProvider>
          </ConnectionProvider>
        </DigilockerProvider>
      </PrivyProvider>
    </GestureHandlerRootView>
  );
}
