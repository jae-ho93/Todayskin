import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { EvidenceLink } from './EvidenceLink';
import { phaseStyle } from '../lib/care-phase-style';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../theme';
import type { CareRoutinePhaseGroup } from '../lib/care-routine';

interface CareRoutinePhaseCardProps {
  group: CareRoutinePhaseGroup;
}

/**
 * 케어 루틴을 phase(예: "외출 후(세안 후)"/"자기 전") 단위로 묶어 카드 하나로 보여준다.
 * 카드에는 그 phase 전체의 이유(reason)만 보이고, 탭하면 화장품을 바르는 순서가
 * 번호와 함께 펼쳐진다 — 단계별 성분/사용량/팁/근거는 그 순서 목록 안에 들어간다.
 */
export function CareRoutinePhaseCard({ group }: CareRoutinePhaseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const phase = phaseStyle(group.phase);

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={expanded ? '바르는 순서 접기' : '바르는 순서 보기'}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: phase.accent }]}>
        <View style={styles.topRow}>
          <View style={[styles.phaseBadge, { backgroundColor: phase.bg }]}>
            <Ionicons name={phase.icon} size={13} color={phase.accent} />
            <Text style={[styles.phaseText, { color: phase.accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {group.phase}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textTertiary}
          />
        </View>

        <Text style={styles.reason}>{group.reason}</Text>

        {!expanded && <Text style={styles.expandHint}>바르는 순서 보기</Text>}

        {expanded && (
          <View style={styles.orderList}>
            {group.steps.map((step, i) => {
              const hasEvidence = Boolean(step.evidence && step.evidence.sourceType !== '없음');
              return (
                <View key={`${step.step}-${i}`} style={styles.orderItem}>
                  <View style={styles.orderNumber}>
                    <Text style={styles.orderNumberText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {i + 1}
                    </Text>
                  </View>
                  <View style={styles.orderBody}>
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
                    {step.detail && <Text style={styles.detailText}>{step.detail}</Text>}
                    {hasEvidence && step.evidence && <EvidenceLink evidence={step.evidence} />}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  card: { gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  phaseText: { ...typography.caption, fontWeight: '700' },
  reason: { ...typography.bodySm, color: colors.textSecondary },
  expandHint: { ...typography.caption, color: colors.sageDark, fontWeight: '700' },
  orderList: {
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  orderItem: { flexDirection: 'row', gap: spacing.sm },
  orderNumber: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderNumberText: { ...typography.caption, color: colors.sageDark, fontWeight: '700' },
  orderBody: { flex: 1, gap: spacing.xs },
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
  detailText: { ...typography.bodySm, color: colors.textPrimary, lineHeight: 20 },
});
