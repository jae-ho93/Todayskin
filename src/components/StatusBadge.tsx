import { StyleSheet, Text, View } from 'react-native';
import type { AirStatus } from '../types';
import { colors, radius, spacing, typography } from '../theme';

const STATUS_META: Record<AirStatus, { color: string; bg: string; label: string }> = {
  good: { color: colors.statusGood, bg: colors.sageLight, label: '좋음' },
  moderate: { color: colors.statusModerate, bg: colors.ochreLight, label: '보통' },
  bad: { color: colors.statusBad, bg: colors.coralLight, label: '나쁨' },
};

interface StatusBadgeProps {
  status?: AirStatus | null; // null/undefined = 해당 항목 조회 실패 — "측정 불가"로 표시
  label: string; // 예: "자외선", "오존"
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  if (!status) {
    return (
      <View style={[styles.badge, styles.badgeUnavailable]}>
        <View style={[styles.dot, styles.dotUnavailable]} />
        <Text style={[styles.text, styles.textUnavailable]}>{label} 측정 불가</Text>
      </View>
    );
  }

  const meta = STATUS_META[status];
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <Text style={[styles.text, { color: meta.color }]}>
        {label} {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    ...typography.caption,
    fontWeight: '700',
  },
  badgeUnavailable: { backgroundColor: colors.gray100 },
  dotUnavailable: { backgroundColor: colors.gray400 },
  textUnavailable: { color: colors.gray400 },
});
