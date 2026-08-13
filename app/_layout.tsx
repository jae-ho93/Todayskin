import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocationProvider } from '../src/hooks/useUserLocation';
import { ToastProvider } from '../src/components/Toast';
import { onSessionExpired } from '../src/lib/session';
import { colors } from '../src/theme';

// F73: 앱이 켜져 있는 동안 리마인더가 조용히 버려지지 않도록 포그라운드 표시 정책을 정한다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// F83: 폰트가 준비되기 전 시스템 폰트가 깜빡 보이지 않게 스플래시를 잡아둔다.
// (실패해도 아래에서 무조건 hide — 앱 진입을 막지 않는다)
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // F83: Pretendard 정적 3종 — 번들 자산이라 로드 실패는 사실상 없지만,
  // 실패(fontError) 시에도 시스템 폰트로 진입한다.
  const [fontsLoaded, fontError] = useFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
  });

  // N18: refresh 토큰 회전 실패로 세션이 정리되면 로그인 화면으로 안내한다.
  useEffect(() => {
    onSessionExpired(() => {
      router.replace('/onboarding/login');
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // 폰트 준비 전에는 스플래시가 계속 보인다 (번들 자산이라 수십 ms 수준).
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <LocationProvider>
        <ToastProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="camera-guide" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="my-info" />
          <Stack.Screen name="diagnosis-result" />
          <Stack.Screen name="recommendation/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="diagnosis/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="legal/terms" options={{ presentation: 'modal' }} />
          <Stack.Screen name="legal/privacy" options={{ presentation: 'modal' }} />
          <Stack.Screen name="trend" />
          <Stack.Screen name="weather-detail" />
        </Stack>
        </ToastProvider>
      </LocationProvider>
    </SafeAreaProvider>
  );
}
