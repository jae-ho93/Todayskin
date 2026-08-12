import { StyleSheet, Text, View } from 'react-native';
import type { EvidenceGrade } from '../types';
import { colors, radius, spacing, typography } from '../theme';

/**
 * N45/F69: B를 '임상 관찰 연구'라고 적어 왔는데, B는 사진과 날씨로 AI가 만든
 * 문장이라 연구를 근거로 든 적이 없다. 배지가 없는 근거를 주장하지 않도록
 * 서버의 등급 정의(evidence-grade.enum.ts)와 같은 말로 맞춘다.
 */
const GRADE_STYLE: Record<EvidenceGrade, { bg: string; text: string; label: string }> = {
  A: { bg: colors.gradeA.bg, text: colors.gradeA.text, label: 'A · 공인 가이드라인' },
  B: { bg: colors.gradeB.bg, text: colors.gradeB.text, label: 'B · AI 생성' },
  C: { bg: colors.gradeC.bg, text: colors.gradeC.text, label: 'C · 개인 통계 관찰' },
};

interface EvidenceBadgeProps {
  grade: EvidenceGrade;
  size?: 'sm' | 'lg';
  showLabel?: boolean;
}

export function EvidenceBadge({ grade, size = 'sm', showLabel = false }: EvidenceBadgeProps) {
  const style = GRADE_STYLE[grade];
  const isLarge = size === 'lg';

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: style.bg },
        isLarge && styles.pillLg,
      ]}
    >
      <Text style={[styles.letter, { color: style.text }, isLarge && styles.letterLg]}>{grade}</Text>
      {showLabel && (
        <Text style={[styles.label, { color: style.text }]} numberOfLines={1}>
          {style.label.split(' · ')[1]}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  pillLg: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  letter: {
    ...typography.badge,
  },
  letterLg: {
    fontSize: 16,
    lineHeight: 20,
  },
  label: {
    ...typography.caption,
  },
});
