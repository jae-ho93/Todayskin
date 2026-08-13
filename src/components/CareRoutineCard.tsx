import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { EvidenceLink } from './EvidenceLink';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../theme';
import type { CareRoutineStep } from '../types';

interface CareRoutineCardProps {
  step: CareRoutineStep;
}

/** 케어 루틴 한 단계 — phase 배지 + 성분/사용량 강조 + 이유 + (있으면) 접이식 근거. */
export function CareRoutineCard({ step }: CareRoutineCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = Boolean(step.evidence && step.evidence.sourceType !== '없음');

  return (
    <Card style={styles.card}>
      <View style={styles.phaseBadge}>
        <Text style={styles.phaseText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {step.phase}
        </Text>
      </View>
      <Text style={styles.stepText}>{step.step}</Text>

      {(step.ingredient || step.amount) && (
        <View style={styles.detailRow}>
          {step.ingredient && (
            <View style={styles.ingredientChip}>
              <Text style={styles.ingredientText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {step.ingredient}
              </Text>
            </View>
          )}
          {step.amount && <Text style={styles.amountText}>{step.amount}</Text>}
        </View>
      )}

      <Text style={styles.reason}>{step.reason}</Text>

      {hasEvidence && (
        <View>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={expanded ? '근거 접기' : '근거 보기'}
            style={styles.toggleRow}
          >
            <Text style={styles.toggleText}>{expanded ? '근거 접기' : '근거 보기'}</Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.textTertiary}
            />
          </Pressable>
          {expanded && step.evidence && <EvidenceLink evidence={step.evidence} />}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  phaseBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sage,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  phaseText: { ...typography.caption, color: colors.textInverse, fontWeight: '700' },
  stepText: { ...typography.subtitle, color: colors.textPrimary },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ingredientChip: {
    backgroundColor: colors.sageLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  ingredientText: { ...typography.bodySm, color: colors.sageDark, fontWeight: '600' },
  amountText: { ...typography.bodySm, color: colors.textSecondary },
  reason: { ...typography.bodySm, color: colors.textSecondary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toggleText: { ...typography.caption, color: colors.textTertiary },
});
