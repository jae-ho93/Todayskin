import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
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
        <Stack.Screen name="diagnosis-result" />
        <Stack.Screen name="recommendation/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trend" />
        <Stack.Screen name="weather-detail" />
      </Stack>
    </SafeAreaProvider>
  );
}
