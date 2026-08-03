import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, value))}%` }]} />
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.bodySm, color: colors.textSecondary, width: 56 },
  track: {
    flex: 1,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.sage, borderRadius: radius.full },
  value: { ...typography.caption, color: colors.textTertiary, width: 28, textAlign: 'right' },
});
