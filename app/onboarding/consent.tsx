import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { OnboardingScaffold } from '../../src/components/OnboardingScaffold';
import { colors, radius, spacing, typography } from '../../src/theme';

// 슬라이드 3: 생체정보(안면 이미지) 처리 동의
export default function OnboardingConsent() {
  const [agreed, setAgreed] = useState(false);

  return (
    <OnboardingScaffold
      step={2}
      totalSteps={3}
      ctaLabel="동의하고 계속하기"
      ctaDisabled={!agreed}
      onPressCta={() => router.push('/onboarding/signup')}
    >
      <Text style={styles.headline}>안면 이미지 처리 동의</Text>
      <Text style={styles.body}>
        얼굴 사진은 개인정보보호법상 생체정보로 분류됩니다.{'\n\n'}
        Weatherskin은 촬영된 원본 이미지를{'\n'}
        <Text style={styles.bold}>서버에 저장하지 않으며</Text>, 피부 분석에 필요한 특징값만 추출해
        암호화 저장합니다.{'\n\n'}
        동의는 설정 화면에서 언제든 철회할 수 있습니다.
      </Text>

      <Pressable style={styles.consentRow} onPress={() => setAgreed((v) => !v)}>
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
          {agreed && <Text style={styles.checkMark}>✓</Text>}
        </View>
        <Text style={styles.consentText}>
          (필수) 안면 이미지 처리방침에 동의합니다
        </Text>
      </Pressable>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  headline: {
    ...typography.displayLg,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  bold: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.sage,
    borderColor: colors.sage,
  },
  checkMark: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  consentText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
});
