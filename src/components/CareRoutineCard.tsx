import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Card } from './Card';
import { EvidenceLink } from './EvidenceLink';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../theme';
import type { CareRoutineStep } from '../types';

interface CareRoutineCardProps {
  step: CareRoutineStep;
}

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * phase 배지 팔레트 — 전부 같은 파스텔 톤(연한 배경 + 진한 동색 텍스트)이되 단계별로
 * 다른 색을 쓴다. LLM이 만드는 phase 문구는 자유 텍스트라 정확히 고정되지 않으므로
 * 키워드로 매칭하고, 못 알아본 문구는 마지막 색으로 묶는다. accent는 카드 왼쪽 강조선과
 * 아이콘에도 같이 써서 배지·카드가 한 세트로 보이게 한다.
 */
const PHASE_PALETTE: { bg: string; accent: string; icon: IoniconName }[] = [
  { bg: '#DCEEDC', accent: '#4F8F5B', icon: 'water-outline' }, // 아침/세안 — 민트
  { bg: '#DCEAFB', accent: '#3F6FA6', icon: 'sunny-outline' }, // 외출 — 하늘빛
  { bg: '#E6DFF5', accent: '#6B4FA0', icon: 'moon-outline' }, // 자기 전/저녁 — 라벤더
  { bg: '#FDEBD3', accent: '#B9772E', icon: 'sparkles-outline' }, // 그 외 — 살구빛
];

function phaseStyle(phase: string): (typeof PHASE_PALETTE)[number] {
  if (phase.includes('아침') || phase.includes('세안')) return PHASE_PALETTE[0];
  if (phase.includes('외출')) return PHASE_PALETTE[1];
  if (phase.includes('자기') || phase.includes('저녁') || phase.includes('밤') || phase.includes('취침')) {
    return PHASE_PALETTE[2];
  }
  return PHASE_PALETTE[3];
}

/**
 * 케어 루틴 한 단계 — 왼쪽 phase 강조선 + 배지 + 성분/사용량 강조 + 이유.
 * 카드 전체가 탭 가능하다 — 누르면 뷰티 유튜버 톤의 상세 팁(detail)과 근거를 펼쳐 보여준다.
 */
export function CareRoutineCard({ step }: CareRoutineCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = Boolean(step.evidence && step.evidence.sourceType !== '없음');
  const hasMore = Boolean(step.detail) || hasEvidence;
  const phase = phaseStyle(step.phase);

  return (
    <Pressable
      onPress={() => hasMore && setExpanded((v) => !v)}
      disabled={!hasMore}
      accessibilityRole={hasMore ? 'button' : undefined}
      accessibilityLabel={hasMore ? (expanded ? '자세히 접기' : '자세히 보기') : undefined}
    >
      <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: phase.accent }]}>
        <View style={styles.topRow}>
          <View style={[styles.phaseBadge, { backgroundColor: phase.bg }]}>
            <Ionicons name={phase.icon} size={13} color={phase.accent} />
            <Text style={[styles.phaseText, { color: phase.accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {step.phase}
            </Text>
          </View>
          {hasMore && (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textTertiary}
            />
          )}
        </View>
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

        <Text style={styles.reason}>{step.reason}</Text>

        {!expanded && hasMore && (
          <Text style={styles.expandHint}>자세히 보기</Text>
        )}

        {expanded && (
          <View style={styles.expandedSection}>
            {step.detail && <Text style={styles.detailText}>{step.detail}</Text>}
            {hasEvidence && step.evidence && <EvidenceLink evidence={step.evidence} />}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  reason: { ...typography.bodySm, color: colors.textSecondary },
  expandHint: { ...typography.caption, color: colors.sageDark, fontWeight: '700' },
  expandedSection: {
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailText: { ...typography.bodySm, color: colors.textPrimary, lineHeight: 20 },
});
