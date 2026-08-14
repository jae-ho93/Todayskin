import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { EvidenceLink } from './EvidenceLink';
import { phaseStyle } from '../lib/care-phase-style';
import { groupRoutineByPhase } from '../lib/care-routine';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../theme';
import type { CareRoutineStep } from '../types';

interface CareRoutineTimelineProps {
  routine: CareRoutineStep[];
}

/**
 * 케어 루틴 전체를 phase 박스로 나누지 않고 하나의 흐름(외출 후(세안 후) → 자기 전)으로
 * 이어 보여준다 — 왼쪽 세로선이 phase 아이콘과 각 단계 번호를 연결해 "이 순서대로
 * 바르면 된다"는 흐름이 한눈에 보이게 한다. 각 단계를 탭하면 그 단계만의 상세 팁과
 * 근거가 펼쳐진다.
 */
export function CareRoutineTimeline({ routine }: CareRoutineTimelineProps) {
  const groups = groupRoutineByPhase(routine);

  return (
    <Card style={styles.card}>
      {groups.map((group, gi) => {
        const phase = phaseStyle(group.phase);
        const isLastGroup = gi === groups.length - 1;
        return (
          <View key={group.phase}>
            <View style={styles.row}>
              <View style={styles.railColumn}>
                <View style={[styles.phaseIcon, { backgroundColor: phase.bg }]}>
                  <Ionicons name={phase.icon} size={16} color={phase.accent} />
                </View>
                <View style={[styles.rail, { backgroundColor: phase.bg }]} />
              </View>
              <View style={styles.headerBody}>
                <Text style={[styles.phaseLabel, { color: phase.accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {group.phase}
                </Text>
                <Text style={styles.reason}>{group.reason}</Text>
              </View>
            </View>

            {group.steps.map((step, si) => {
              const isLastStep = isLastGroup && si === group.steps.length - 1;
              return (
                <RoutineStepRow
                  key={`${step.step}-${si}`}
                  step={step}
                  order={si + 1}
                  accent={phase.accent}
                  bg={phase.bg}
                  showRail={!isLastStep}
                />
              );
            })}
          </View>
        );
      })}
    </Card>
  );
}

function RoutineStepRow({
  step,
  order,
  accent,
  bg,
  showRail,
}: {
  step: CareRoutineStep;
  order: number;
  accent: string;
  bg: string;
  showRail: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = Boolean(step.evidence && step.evidence.sourceType !== '없음');
  const hasMore = Boolean(step.detail) || hasEvidence;

  return (
    <Pressable
      onPress={() => hasMore && setExpanded((v) => !v)}
      disabled={!hasMore}
      accessibilityRole={hasMore ? 'button' : undefined}
      accessibilityLabel={hasMore ? (expanded ? '자세히 접기' : '자세히 보기') : undefined}
      style={({ pressed }) => [styles.row, pressed && hasMore && styles.pressed]}
    >
      <View style={styles.railColumn}>
        <View style={[styles.stepDot, { backgroundColor: bg }]}>
          <Text style={[styles.stepDotText, { color: accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {order}
          </Text>
        </View>
        {showRail && <View style={[styles.rail, { backgroundColor: bg }]} />}
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

        {!expanded && hasMore && <Text style={styles.expandHint}>자세히 보기</Text>}

        {expanded && (
          <View style={styles.expandedSection}>
            {step.detail && <Text style={styles.detailText}>{step.detail}</Text>}
            {hasEvidence && step.evidence && <EvidenceLink evidence={step.evidence} />}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 0 },
  pressed: { opacity: 0.72 },
  row: { flexDirection: 'row' },
  railColumn: { width: 32, alignItems: 'center' },
  phaseIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  stepDotText: { ...typography.caption, fontWeight: '700', fontSize: 12 },
  rail: { flex: 1, width: 2, minHeight: spacing.sm },
  headerBody: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  phaseLabel: { ...typography.subtitle, fontWeight: '700' },
  reason: { ...typography.bodySm, color: colors.textSecondary },
  stepBody: { flex: 1, paddingBottom: spacing.lg, gap: spacing.xs },
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
  ingredientText: { ...typography.bodySm, color: colors.sageDark, fontWeight: '600' },
  amountText: { ...typography.bodySm, color: colors.textSecondary },
  expandHint: { ...typography.caption, color: colors.sageDark, fontWeight: '700' },
  expandedSection: { gap: spacing.sm },
  detailText: { ...typography.bodySm, color: colors.textPrimary, lineHeight: 20 },
});
