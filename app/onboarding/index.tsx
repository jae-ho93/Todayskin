import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { OnboardingScaffold } from '../../src/components/OnboardingScaffold';
import { colors, radius, spacing, typography } from '../../src/theme';

// 슬라이드 1: 앱 핵심 가치 제안
export default function OnboardingSlide1() {
  return (
    <OnboardingScaffold
      step={0}
      totalSteps={3}
      ctaLabel="다음"
      onPressCta={() => router.push('/onboarding/structure')}
      onSkip={() => router.push('/onboarding/consent')}
    >
      <View style={styles.illustration}>
        <Text style={styles.illustrationEmoji}>🌤️</Text>
      </View>
      <Text style={styles.headline}>오늘 날씨,{'\n'}오늘 내 피부에 맞는 케어</Text>
      <Text style={styles.body}>
        실시간 날씨·대기질 데이터와 AI 피부 분석을 결합해{'\n'}근거 있는 스킨케어를 추천해 드려요.
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
