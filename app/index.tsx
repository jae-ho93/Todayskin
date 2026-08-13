import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { getSession } from '../src/lib/session';

const LOGO_DISPLAY_MS = 2000;

export default function Index() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    // 세션 확인이 아무리 빨리 끝나도 로고가 최소 LOGO_DISPLAY_MS만큼은 보이게 한다 —
    // 세션 확인 자체를 늦추는 게 아니라 "화면 전환"만 그만큼 늦춘다.
    let cancelled = false;
    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, LOGO_DISPLAY_MS));
    Promise.all([getSession(), minDelay]).then(([user]) => {
      if (cancelled) return;
      setHasSession(user !== null);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <View style={styles.splash}>
        <Image source={require('../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
      </View>
    );
  }

  return <Redirect href={hasSession ? '/(tabs)' : '/onboarding'} />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  logo: { width: 280, height: 280 },
});
