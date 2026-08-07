import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import { FACE_PART_PIN_POSITION, FaceIllustration } from '../src/components/FaceIllustration';
import { getSession } from '../src/lib/session';
import { gradeToColor } from '../src/lib/skinGrade';
import { colors, radius, shadow, spacing, typography } from '../src/theme';
import type { Gender, SkinPartMetric, SkinScoreSnapshot } from '../src/types';

// 화면 4: 진단 결과 — 얼굴 일러스트 위에 부위별 핀을 등급 색으로 표시하고, 탭하면 상세 정보를 띄운다.
export default function DiagnosisResultScreen() {
  const [skinScore, setSkinScore] = useState<SkinScoreSnapshot | null>(null);
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [selectedPart, setSelectedPart] = useState<SkinPartMetric | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getSkinScore(), getSession()]).then(([result, session]) => {
      if (cancelled) return;
      if (result.status === 'ok') setSkinScore(result.data);
      setGender(session?.gender);
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

      <View style={styles.faceWrap}>
        <FaceIllustration gender={gender} />
        {skinScore.parts.map((p) => {
          const pos = FACE_PART_PIN_POSITION[p.part];
          if (!pos) return null;
          const color = gradeToColor(p.grade);
          return (
            <Pressable
              key={p.part}
              onPress={() => setSelectedPart(p)}
              hitSlop={10}
              style={[
                styles.pin,
                { left: `${pos.xPct}%`, top: `${pos.yPct}%`, backgroundColor: color },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.faceHint}>표시를 눌러 부위별 상세 정보를 확인하세요</Text>

      <Text style={styles.disclaimer}>측정·추정값입니다. 의학적 진단이 아닙니다.</Text>

      <Modal
        visible={selectedPart !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPart(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedPart(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            {selectedPart && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderLeft}>
                    <View style={[styles.modalDot, { backgroundColor: gradeToColor(selectedPart.grade) }]} />
                    <Text style={styles.modalTitle}>{selectedPart.label}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedPart(null)} hitSlop={12}>
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <View
                  style={[
                    styles.modalGradeBadge,
                    { backgroundColor: gradeToColor(selectedPart.grade) + '22' },
                  ]}
                >
                  <Text style={[styles.modalGradeText, { color: gradeToColor(selectedPart.grade) }]}>
                    {selectedPart.grade}
                  </Text>
                </View>
                {selectedPart.note && <Text style={styles.modalNote}>{selectedPart.note}</Text>}
                {(typeof selectedPart.moisture === 'number' ||
                  typeof selectedPart.elasticity === 'number') && (
                  <View style={styles.modalMetricRow}>
                    {typeof selectedPart.moisture === 'number' && (
                      <View style={styles.modalMetric}>
                        <Text style={styles.modalMetricLabel}>수분</Text>
                        <Text style={styles.modalMetricValue}>{selectedPart.moisture}</Text>
                      </View>
                    )}
                    {typeof selectedPart.elasticity === 'number' && (
                      <View style={styles.modalMetric}>
                        <Text style={styles.modalMetricLabel}>탄력</Text>
                        <Text style={styles.modalMetricValue}>{selectedPart.elasticity}</Text>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const PIN_SIZE = 18;

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
    marginTop: spacing.sm,
  },
  overallLabel: { ...typography.bodySm, color: colors.textSecondary },
  overallScore: { ...typography.displaySm, color: colors.textPrimary },
  faceWrap: {
    width: '92%',
    aspectRatio: 150 / 200,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  pin: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    marginLeft: -PIN_SIZE / 2,
    marginTop: -PIN_SIZE / 2,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.surface,
    ...shadow.card,
  },
  faceHint: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 'auto',
    marginBottom: spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(29, 28, 25, 0.4)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.card,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalDot: { width: 12, height: 12, borderRadius: 6 },
  modalTitle: { ...typography.headline, color: colors.textPrimary },
  modalGradeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  modalGradeText: { ...typography.bodySm, fontWeight: '700' },
  modalNote: { ...typography.body, color: colors.textSecondary },
  modalMetricRow: { flexDirection: 'row', gap: spacing.xl },
  modalMetric: { gap: 2 },
  modalMetricLabel: { ...typography.caption, color: colors.textTertiary },
  modalMetricValue: { ...typography.headline, color: colors.textPrimary },
});
