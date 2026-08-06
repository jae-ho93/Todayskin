import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import { colors, radius, shadow, spacing, typography } from '../src/theme';
import type { SkinScoreSnapshot } from '../src/types';

// 화면 4: 진단 결과 — 얼굴 부위별 요약 (임시: 얼굴 일러스트 대신 텍스트 목록으로 표시)
export default function DiagnosisResultScreen() {
  const [skinScore, setSkinScore] = useState<SkinScoreSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getSkinScore().then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') setSkinScore(result.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <View style={[styles.flex, styles.centered]}>
        <ActivityIndicator color={colors.sage} />
      </View>
    );
  }

  if (!skinScore) {
    return (
      <View style={[styles.flex, styles.centered]}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textTertiary} />
        <Text style={styles.unavailableTitle}>진단 결과를 불러올 수 없어요</Text>
        <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12} style={styles.unavailableCta}>
          <Text style={styles.unavailableCtaText}>홈으로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <SafeAreaView style={styles.header}>
        <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>오늘의 진단 결과</Text>
        <View style={{ width: 22 }} />
      </SafeAreaView>

      <View style={styles.summaryRow}>
        <Text style={styles.overallLabel}>종합 점수</Text>
        <Text style={styles.overallScore}>{skinScore.overallScore}</Text>
      </View>

      <ScrollView style={styles.partsList} contentContainerStyle={styles.partsListContent}>
        {skinScore.parts.map((p) => (
          <View key={p.part} style={styles.partRow}>
            <View style={styles.partHeader}>
              <Text style={styles.partLabel}>{p.label}</Text>
              <Text style={styles.partGrade}>{p.grade}</Text>
            </View>
            {p.note && <Text style={styles.partDetail}>{p.note}</Text>}
            {(typeof p.moisture === 'number' || typeof p.elasticity === 'number') && (
              <Text style={styles.partDetail}>
                {[
                  typeof p.moisture === 'number' ? `수분 ${p.moisture}` : null,
                  typeof p.elasticity === 'number' ? `탄력 ${p.elasticity}` : null,
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>

      <Text style={styles.disclaimer}>측정·추정값입니다. 의학적 진단이 아닙니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  unavailableTitle: { ...typography.headline, color: colors.textPrimary },
  unavailableCta: {
    marginTop: spacing.sm,
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  unavailableCtaText: { ...typography.subtitle, color: colors.textInverse },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: { ...typography.subtitle, color: colors.textPrimary },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  overallLabel: { ...typography.bodySm, color: colors.textSecondary },
  overallScore: { ...typography.displaySm, color: colors.textPrimary },
  partsList: { flex: 1, marginTop: spacing.lg },
  partsListContent: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.lg },
  partRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  partHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  partLabel: { ...typography.headline, color: colors.textPrimary },
  partGrade: { ...typography.subtitle, color: colors.sageDark },
  partDetail: { ...typography.bodySm, color: colors.textSecondary },
  disclaimer: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 'auto',
    marginBottom: spacing.xl,
  },
});
