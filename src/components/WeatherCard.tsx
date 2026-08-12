import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WeatherSnapshot } from '../types';
import { AIR_STATUS_LABEL } from '../lib/air-status';
import { colors, spacing, typography } from '../theme';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';

export function WeatherCard({ weather }: { weather: WeatherSnapshot }) {
  return (
    <Pressable onPress={() => router.push('/weather-detail')}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.regionName}>
            {[weather.regionName, weather.districtName].filter(Boolean).join(' ')}
          </Text>
          <Text style={styles.moreLink}>자세히 보기 →</Text>
        </View>
        {/* N53: 기온·습도 실황 요약 — 값이 하나라도 있으면 보여준다 */}
        {(typeof weather.temperature === 'number' ||
          typeof weather.humidity === 'number') && (
          <Text style={styles.nowcastLine}>
            {[
              typeof weather.temperature === 'number'
                ? `기온 ${weather.temperature}°C`
                : null,
              typeof weather.humidity === 'number'
                ? `습도 ${weather.humidity}%`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
        {weather.caiStatus && (
          <Text style={styles.caiLine}>
            오늘 종합 대기질: {AIR_STATUS_LABEL[weather.caiStatus]}
          </Text>
        )}
        <View style={styles.badgeRow}>
          <StatusBadge
            scale="uv"
            status={weather.uvStatusPeak ?? weather.uvStatus}
            label="자외선"
          />
          <StatusBadge scale="air" status={weather.ozoneStatus} label="오존" />
          <StatusBadge scale="air" status={weather.pm10Status} label="미세먼지" />
          <StatusBadge scale="air" status={weather.pm25Status} label="초미세먼지" />
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
  nowcastLine: {
    ...typography.bodySm,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: spacing.xs,
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
