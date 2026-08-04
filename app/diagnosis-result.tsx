import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import { FaceIllustration } from '../src/components/FaceIllustration';
import { MetricBar } from '../src/components/MetricBar';
import { mockSkinScore } from '../src/data/mock';
import { colors, radius, shadow, spacing, typography } from '../src/theme';
import type { FacePart, SkinPartMetric, SkinScoreSnapshot } from '../src/types';

// FaceIllustration의 실제 이목구비 좌표(viewBox 150x200, 얼굴 타원 cx=75 cy=100 rx=48 ry=62)를
// 기준으로 계산한 퍼센트다. FaceIllustration의 좌표를 바꾸면 이 값도 같이 맞춰야 한다.
const PIN_POSITION: Record<FacePart, { top: `${number}%`; left: `${number}%` }> = {
  forehead: { top: '26%', left: '50%' },
  glabella: { top: '42%', left: '50%' },
  eyeArea: { top: '42%', left: '37%' },
  cheek: { top: '60%', left: '66%' },
  lips: { top: '65%', left: '50%' },
  jaw: { top: '78%', left: '50%' },
};

// 화면 4: 진단 결과 — 얼굴 부위별 요약
export default function DiagnosisResultScreen() {
  const [selected, setSelected] = useState<SkinPartMetric | null>(null);
  const [skinScore, setSkinScore] = useState<SkinScoreSnapshot>(mockSkinScore);

  useEffect(() => {
    let cancelled = false;
    api.getSkinScore().then((result) => {
      if (!cancelled && result) setSkinScore(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.flex}>
      <SafeAreaView style={styles.header}>
        <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>오늘의 진단 결과</Text>
        <View style={{ width: 22 }} />
      </SafeAreaView>

      <View style={styles.photoWrap}>
        <View style={styles.photoPlaceholder}>
          <FaceIllustration />
        </View>
        {skinScore.parts.map((p) => (
          <Pressable
            key={p.part}
            style={[styles.pin, PIN_POSITION[p.part], selected?.part === p.part && styles.pinActive]}
            onPress={() => setSelected(p)}
          >
            <View style={styles.pinDot} />
          </Pressable>
        ))}
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.overallLabel}>종합 점수</Text>
        <Text style={styles.overallScore}>{skinScore.overallScore}</Text>
      </View>

      {selected ? (
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{selected.label}</Text>
            <Text style={styles.sheetGrade}>{selected.grade}</Text>
          </View>
          <View style={styles.sheetMetrics}>
            {typeof selected.moisture === 'number' && <MetricBar label="수분" value={selected.moisture} />}
            {typeof selected.elasticity === 'number' && (
              <MetricBar label="탄력" value={selected.elasticity} />
            )}
          </View>
        </View>
      ) : (
        <Text style={styles.hint}>부위별 핀을 눌러 자세한 측정값을 확인하세요</Text>
      )}

      <Text style={styles.disclaimer}>측정·추정값입니다. 의학적 진단이 아닙니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: { ...typography.subtitle, color: colors.textPrimary },
  photoWrap: {
    marginHorizontal: spacing.lg,
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    backgroundColor: colors.gray100,
    overflow: 'hidden',
  },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pin: {
    position: 'absolute',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  pinActive: { backgroundColor: colors.sage },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.coral },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  overallLabel: { ...typography.bodySm, color: colors.textSecondary },
  overallScore: { ...typography.displaySm, color: colors.textPrimary },
  hint: {
    ...typography.bodySm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  sheet: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray200,
    alignSelf: 'center',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { ...typography.headline, color: colors.textPrimary },
  sheetGrade: { ...typography.subtitle, color: colors.sageDark },
  sheetMetrics: { gap: spacing.sm },
  disclaimer: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 'auto',
    marginBottom: spacing.xl,
  },
});
