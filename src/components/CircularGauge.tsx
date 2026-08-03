import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, typography } from '../theme';

interface CircularGaugeProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
  color?: string;
}

export function CircularGauge({
  value,
  size = 140,
  strokeWidth = 12,
  label,
  color = colors.sage,
}: CircularGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.gray100}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.value}>{Math.round(clamped)}</Text>
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    alignItems: 'center',
  },
  value: {
    ...typography.displaySm,
    color: colors.textPrimary,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
