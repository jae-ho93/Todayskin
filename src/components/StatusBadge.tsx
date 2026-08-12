import { StyleSheet, Text, View } from 'react-native';
import type { AirStatus } from '../types';
import { AIR_STATUS_BG, AIR_STATUS_COLOR, AIR_STATUS_LABEL } from '../lib/air-status';
import { colors, radius, spacing, typography } from '../theme';

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

  const color = AIR_STATUS_COLOR[status];
  return (
    <View style={[styles.badge, { backgroundColor: AIR_STATUS_BG[status] }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>
        {label} {AIR_STATUS_LABEL[status]}
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
