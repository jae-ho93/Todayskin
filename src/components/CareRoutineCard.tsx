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

/**
 * phase 배지 팔레트 — 전부 같은 파스텔 톤(연한 배경 + 진한 동색 텍스트)이되 단계별로
 * 다른 색을 쓴다. LLM이 만드는 phase 문구는 자유 텍스트라 정확히 고정되지 않으므로
 * 키워드로 매칭하고, 못 알아본 문구는 마지막 색으로 묶는다.
 */
const PHASE_PALETTE = [
  { bg: '#DCEEDC', text: '#4F8F5B' }, // 아침/세안 — 민트
  { bg: '#DCEAFB', text: '#3F6FA6' }, // 외출 — 하늘빛
  { bg: '#E6DFF5', text: '#6B4FA0' }, // 자기 전/저녁 — 라벤더
  { bg: '#FDEBD3', text: '#B9772E' }, // 그 외 — 살구빛
] as const;

function phaseColor(phase: string): (typeof PHASE_PALETTE)[number] {
  if (phase.includes('아침') || phase.includes('세안')) return PHASE_PALETTE[0];
  if (phase.includes('외출')) return PHASE_PALETTE[1];
  if (phase.includes('자기') || phase.includes('저녁') || phase.includes('밤') || phase.includes('취침')) {
    return PHASE_PALETTE[2];
  }
  return PHASE_PALETTE[3];
}

/** 케어 루틴 한 단계 — phase 배지 + 성분/사용량 강조 + 이유 + (있으면) 접이식 근거. */
export function CareRoutineCard({ step }: CareRoutineCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = Boolean(step.evidence && step.evidence.sourceType !== '없음');
  const phase = phaseColor(step.phase);

  return (
    <Card style={styles.card}>
      <View style={[styles.phaseBadge, { backgroundColor: phase.bg }]}>
        <Text style={[styles.phaseText, { color: phase.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
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
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  phaseText: { ...typography.caption, fontWeight: '700' },
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
