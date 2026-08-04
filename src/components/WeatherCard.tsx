import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
    <Pressable onPress={() => router.push('/weather-detail')}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.regionName}>{weather.regionName}</Text>
          <Text style={styles.moreLink}>자세히 보기 →</Text>
        </View>
        {weather.caiStatus && (
          <Text style={styles.caiLine}>오늘 종합 대기질: {CAI_LABEL[weather.caiStatus]}</Text>
        )}
        <View style={styles.badgeRow}>
          <StatusBadge status={weather.uvStatusPeak ?? weather.uvStatus} label="자외선" />
          <StatusBadge status={weather.ozoneStatus} label="오존" />
          <StatusBadge status={weather.pm10Status} label="미세먼지" />
          <StatusBadge status={weather.pm25Status} label="초미세먼지" />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  regionName: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  moreLink: {
    ...typography.bodySm,
    color: colors.sageDark,
    fontWeight: '600',
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
