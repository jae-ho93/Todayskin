import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { EvidenceLink } from './EvidenceLink';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../theme';
import type { CareRoutineStep } from '../types';

interface CareRoutineTimelineProps {
  routine: CareRoutineStep[];
}

/**
 * 케어 루틴을 "외출 후(세안 후)/자기 전"이나 "외출 전/외출 중" 같은 단계 구분 없이
 * 하나로 묶어 순서대로 보여준다 — 왼쪽 세로선이 번호를 이어 "이 순서대로 바르면
 * 된다"는 흐름만 남긴다. 같은 이유(reason)가 연속되면 한 번만 보여준다(같은 근거를
 * 단계마다 반복하지 않는다). 각 단계를 탭하면 그 단계만의 상세 팁(재도포 주기 같은
 * 실전 주의사항 포함)과 근거가 펼쳐진다.
 */
export function CareRoutineTimeline({ routine }: CareRoutineTimelineProps) {
  let previousReason: string | null = null;

  return (
    <Card style={styles.card}>
      {routine.map((step, i) => {
        const showReason = step.reason !== previousReason;
        previousReason = step.reason;
        return (
          <RoutineStepRow
            key={`${step.step}-${i}`}
            step={step}
            order={i + 1}
            showReason={showReason}
            showRail={i < routine.length - 1}
          />
        );
      })}
    </Card>
  );
}

function RoutineStepRow({
  step,
  order,
  showReason,
  showRail,
}: {
  step: CareRoutineStep;
  order: number;
  showReason: boolean;
  showRail: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = Boolean(step.evidence && step.evidence.sourceType !== '없음');
  const hasMore = Boolean(step.detail);

  return (
    <Pressable
      onPress={() => hasMore && setExpanded((v) => !v)}
      disabled={!hasMore}
      accessibilityRole={hasMore ? 'button' : undefined}
      accessibilityLabel={hasMore ? (expanded ? '자세히 접기' : '자세히 보기') : undefined}
      style={({ pressed }) => [styles.row, pressed && hasMore && styles.pressed]}
    >
      <View style={styles.railColumn}>
        <View style={styles.stepDot}>
          <Text style={styles.stepDotText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {order}
          </Text>
        </View>
        {showRail && <View style={styles.rail} />}
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepText}>{step.step}</Text>

        {(step.ingredient || step.amount) && (
          <View style={styles.detailRow}>
            {step.ingredient && (
              <View style={styles.ingredientChip}>
                <Ionicons name="leaf-outline" size={12} color={colors.sageDark} />
                <Text style={styles.ingredientText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {step.ingredient}
                </Text>
              </View>
            )}
            {step.amount && <Text style={styles.amountText}>{step.amount}</Text>}
          </View>
        )}

        {showReason && <Text style={styles.reason}>{step.reason}</Text>}

        {hasEvidence && step.evidence && <EvidenceLink evidence={step.evidence} />}

        {hasMore && (
          <View style={styles.expandHintRow}>
            <Text style={styles.expandHint}>{expanded ? '접기' : '자세히 보기'}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={colors.sageDark} />
          </View>
        )}

        {expanded && step.detail && (
          <View style={styles.expandedSection}>
            <Text style={styles.detailText}>{step.detail}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 0, padding: spacing.md },
  pressed: { opacity: 0.72 },
  row: { flexDirection: 'row' },
  railColumn: { width: 32, alignItems: 'center' },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.sageDark,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  stepDotText: { ...typography.caption, fontWeight: '700', fontSize: 12, color: colors.sageDark },
  rail: { flex: 1, width: 1.5, minHeight: spacing.md, backgroundColor: colors.border },
  stepBody: { flex: 1, minWidth: 0, paddingBottom: spacing.lg, gap: spacing.xs },
  stepText: { ...typography.subtitle, color: colors.textPrimary, fontSize: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  ingredientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.sageLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  ingredientText: { ...typography.bodySm, fontWeight: '600', color: colors.sageDark },
  amountText: { ...typography.bodySm, color: colors.textSecondary },
  reason: { ...typography.bodySm, color: colors.textSecondary },
  expandHintRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  expandHint: { ...typography.caption, fontWeight: '700', color: colors.sageDark },
  expandedSection: { gap: spacing.sm, paddingTop: 2 },
  detailText: { ...typography.bodySm, color: colors.textPrimary, lineHeight: 20 },
});
