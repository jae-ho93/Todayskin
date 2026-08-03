import { StyleSheet, Text, View } from 'react-native';
import type { WeatherSnapshot } from '../types';
import { colors, spacing, typography } from '../theme';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';

const CAI_LABEL: Record<'good' | 'moderate' | 'bad', string> = {
  good: '좋음',
  moderate: '보통',
  bad: '나쁨',
};

export function WeatherCard({ weather }: { weather: WeatherSnapshot }) {
  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.temp}>{weather.temperatureC}°</Text>
        <Text style={styles.feelsLike}>체감 {weather.feelsLikeC}°</Text>
      </View>
      {weather.caiStatus && (
        <Text style={styles.caiLine}>오늘 종합 대기질: {CAI_LABEL[weather.caiStatus]}</Text>
      )}
      <View style={styles.badgeRow}>
        <StatusBadge status={weather.uvStatus} label="자외선" />
        <StatusBadge status={weather.ozoneStatus} label="오존" />
        <StatusBadge status={weather.pm10Status} label="미세먼지" />
        <StatusBadge status={weather.pm25Status} label="초미세먼지" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  temp: {
    ...typography.displayLg,
    color: colors.textPrimary,
  },
  feelsLike: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  caiLine: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
