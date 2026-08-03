import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import type { PersonalPatternPoint } from '../types';
import { colors, spacing, typography } from '../theme';

interface DualLineChartProps {
  series: PersonalPatternPoint[];
  height?: number;
  primaryLabel: string;
  secondaryLabel: string;
}

function toPoints(values: number[], width: number, height: number) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);
  return values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(' ');
}

export function DualLineChart({ series, height = 140, primaryLabel, secondaryLabel }: DualLineChartProps) {
  const width = 300;
  const skinPoints = toPoints(series.map((s) => s.skinMetricValue), width, height);
  const envPoints = toPoints(series.map((s) => s.environmentValue), width, height);

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Polyline points={envPoints} fill="none" stroke={colors.coral} strokeWidth={2} />
        <Polyline points={skinPoints} fill="none" stroke={colors.sage} strokeWidth={2.5} />
      </Svg>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors.sage }]} />
          <Text style={styles.legendText}>{primaryLabel}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors.coral }]} />
          <Text style={styles.legendText}>{secondaryLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...typography.caption, color: colors.textSecondary },
});
