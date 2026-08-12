import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
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

export default function RootLayout() {
  // N18: refresh 토큰 회전 실패로 세션이 정리되면 로그인 화면으로 안내한다.
  useEffect(() => {
    onSessionExpired(() => {
      router.replace('/onboarding/login');
    });
  }, []);

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
