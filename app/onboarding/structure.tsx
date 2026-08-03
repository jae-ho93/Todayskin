import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { EvidenceBadge } from '../../src/components/EvidenceBadge';
import { OnboardingScaffold } from '../../src/components/OnboardingScaffold';
import { colors, radius, spacing, typography } from '../../src/theme';

const STEPS: { grade: 'A' | 'B' | 'C'; title: string; desc: string }[] = [
  { grade: 'A', title: '날씨 기반 추천', desc: '가입 즉시, 실시간 기상청·에어코리아 데이터로' },
  { grade: 'B', title: '사진 기반 추천', desc: '사진 업로드 즉시, AI 피부 분석 결과로' },
  { grade: 'C', title: '개인 패턴 추천', desc: '2~3주 데이터 누적 후, 나만의 상관 패턴으로' },
];

// 슬라이드 2: 3단 추천 구조 설명
export default function OnboardingSlide2() {
  return (
    <OnboardingScaffold
      step={1}
      totalSteps={4}
      ctaLabel="다음"
      onPressCta={() => router.push('/onboarding/consent')}
      onSkip={() => router.push('/onboarding/consent')}
    >
      <Text style={styles.headline}>날씨 기반 + 사진 기반 + 개인 패턴{'\n'}3단 추천 구조</Text>
      <View style={styles.list}>
        {STEPS.map((s) => (
          <View key={s.grade} style={styles.row}>
            <EvidenceBadge grade={s.grade} size="lg" />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{s.title}</Text>
              <Text style={styles.rowDesc}>{s.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  headline: {
    ...typography.displayLg,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  rowDesc: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
});
