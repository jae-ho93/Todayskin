import { StyleSheet, Text, View } from 'react-native';
import type { AirStatus } from '../types';
import { colors, radius, spacing, typography } from '../theme';

const STATUS_META: Record<AirStatus, { color: string; bg: string; label: string }> = {
  good: { color: colors.statusGood, bg: colors.sageLight, label: '좋음' },
  moderate: { color: colors.statusModerate, bg: colors.ochreLight, label: '보통' },
  bad: { color: colors.statusBad, bg: colors.coralLight, label: '나쁨' },
};

interface StatusBadgeProps {
  status: AirStatus;
  label: string; // 예: "자외선", "오존"
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
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
});
