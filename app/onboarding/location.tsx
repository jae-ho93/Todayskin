import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { OnboardingScaffold } from '../../src/components/OnboardingScaffold';
import { colors, radius, spacing, typography } from '../../src/theme';

// 슬라이드 4: 위치 권한 안내 (실제 OS 권한 다이얼로그는 이 화면의 CTA를 눌러야 뜬다)
export default function OnboardingLocation() {
  const [requesting, setRequesting] = useState(false);

  const handleAllow = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      await Location.requestForegroundPermissionsAsync();
    } finally {
      // 허용/거부 어느 쪽이든 가입 진행은 막지 않는다 — 거부 시 기본 지역(서울)으로 자동 폴백
      router.push('/onboarding/signup');
    }
  };

  return (
    <OnboardingScaffold
      step={3}
      totalSteps={4}
      ctaLabel={requesting ? '확인 중…' : '위치 권한 허용하기'}
      ctaDisabled={requesting}
      onPressCta={handleAllow}
      onSkip={() => router.push('/onboarding/signup')}
    >
      <View style={styles.illustration}>
        {requesting ? (
          <ActivityIndicator color={colors.sageDark} />
        ) : (
          <Text style={styles.illustrationEmoji}>📍</Text>
        )}
      </View>
      <Text style={styles.headline}>우리 동네 날씨를{'\n'}정확하게 보여드릴게요</Text>
      <Text style={styles.body}>
        위치 정보를 허용하면 지금 계신 곳 기준 실시간 날씨·대기질 데이터로{'\n'}
        더 정확한 피부 케어 추천을 받을 수 있어요.{'\n\n'}
        거부해도 서비스는 그대로 이용할 수 있고, 기본 지역(서울) 기준으로 보여드려요.
      </Text>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  illustration: {
    alignSelf: 'center',
    width: 220,
    height: 220,
    borderRadius: radius.xl,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  illustrationEmoji: {
    fontSize: 88,
  },
  headline: {
    ...typography.displayLg,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
