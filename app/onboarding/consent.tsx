import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { setPendingConsent } from '../../src/lib/pendingConsents';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { ConsentPurpose, ConsentPurposeInfo } from '../../src/types';

// 슬라이드 3: 동의 — 서버 registry(GET /consents/registry)를 그대로 렌더링한다.
// 여기서 고른 값은 실제로는 회원가입 성공 후(토큰 발급 후) POST /consents로 전송된다
// (이 화면 시점엔 아직 로그인 전이라 인증이 필요한 동의 등록 API를 호출할 수 없음).
export default function OnboardingConsent() {
  const [registry, setRegistry] = useState<ConsentPurposeInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState<Partial<Record<ConsentPurpose, boolean>>>({});

  useEffect(() => {
    let cancelled = false;
    api.getConsentRegistry().then((result) => {
      if (cancelled) return;
      setRegistry(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const requiredPurposes = registry?.filter((r) => r.required) ?? [];
  const allRequiredAgreed = requiredPurposes.every((r) => agreed[r.purpose]);

  const handleContinue = () => {
    if (!registry) return;
    for (const item of registry) {
      setPendingConsent(item.purpose, agreed[item.purpose] ?? false);
    }
    router.push('/onboarding/location');
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centered]}>
        <ActivityIndicator color={colors.sage} />
      </SafeAreaView>
    );
  }

  if (!registry) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centered]}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textTertiary} />
        <Text style={styles.unavailableTitle}>동의 항목을 불러올 수 없어요</Text>
        <Pressable
          onPress={() => {
            setLoading(true);
            api.getConsentRegistry().then((result) => {
              setRegistry(result);
              setLoading(false);
            });
          }}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <View style={styles.dots}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={[styles.dot, i === 2 && styles.dotActive]} />
          ))}
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>이용 동의</Text>
        <Text style={styles.subtitle}>
          얼굴 사진은 개인정보보호법상 생체정보로 분류돼요. 아래 항목에 동의해주세요.
        </Text>

        {registry.map((item) => {
          const isAgreed = agreed[item.purpose] ?? false;
          return (
            <Pressable
              key={item.purpose}
              style={styles.consentCard}
              onPress={() => setAgreed((prev) => ({ ...prev, [item.purpose]: !isAgreed }))}
            >
              <View style={styles.consentCardHeader}>
                <View style={[styles.checkbox, isAgreed && styles.checkboxChecked]}>
                  {isAgreed && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text style={styles.consentTitle}>
                  ({item.required ? '필수' : '선택'}) {item.title}
                </Text>
              </View>
              <Text style={styles.consentDescription}>{item.description}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={handleContinue}
        disabled={!allRequiredAgreed}
        style={({ pressed }) => [
          styles.cta,
          !allRequiredAgreed && styles.ctaDisabled,
          pressed && allRequiredAgreed && styles.ctaPressed,
        ]}
      >
        <Text style={styles.ctaText}>동의하고 계속하기</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  unavailableTitle: { ...typography.headline, color: colors.textPrimary },
  retryButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryButtonText: { ...typography.subtitle, color: colors.textInverse },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gray200 },
  dotActive: { backgroundColor: colors.sage, width: 20 },
  body: { flex: 1 },
  bodyContent: { gap: spacing.lg, paddingVertical: spacing.xl },
  headline: { ...typography.displayLg, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  consentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  consentCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  consentTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700', flex: 1 },
  consentDescription: { ...typography.bodySm, color: colors.textSecondary },
  cta: {
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  ctaDisabled: {
    backgroundColor: colors.gray200,
  },
  ctaPressed: {
    backgroundColor: colors.sageDark,
  },
  ctaText: {
    ...typography.headline,
    color: colors.textInverse,
  },
});
