import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../src/api/client';
import { Card } from '../src/components/Card';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { useUserLocation } from '../src/hooks/useUserLocation';
import { colors, radius, spacing, typography } from '../src/theme';
import type { AirStatus, WeatherSnapshot } from '../src/types';

const STATUS_LABEL: Record<AirStatus, string> = { good: '좋음', moderate: '보통', bad: '나쁨' };
const STATUS_COLOR: Record<AirStatus, string> = {
  good: colors.statusGood,
  moderate: colors.statusModerate,
  bad: colors.statusBad,
};

function MetricCard({
  icon,
  label,
  value,
  unit,
  status,
  description,
  extra,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | null | undefined;
  unit: string;
  status: AirStatus | null | undefined;
  description: string;
  extra?: string;
}) {
  return (
    <Card style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <View style={styles.metricIconWrap}>
          <Ionicons name={icon} size={20} color={colors.sageDark} />
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
        {status ? (
          <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[status] + '22' }]}>
            <Text style={[styles.statusPillText, { color: STATUS_COLOR[status] }]}>
              {STATUS_LABEL[status]}
            </Text>
          </View>
        ) : (
          <View style={[styles.statusPill, styles.statusPillUnavailable]}>
            <Text style={[styles.statusPillText, styles.statusPillTextUnavailable]}>측정 불가</Text>
          </View>
        )}
      </View>
      {typeof value === 'number' ? (
        <View style={styles.metricValueRow}>
          <Text style={styles.metricValue}>{value}</Text>
          <Text style={styles.metricUnit}>{unit}</Text>
        </View>
      ) : (
        <Text style={styles.metricUnavailableText}>지금 값을 불러올 수 없어요</Text>
      )}
      {extra && <Text style={styles.metricExtra}>{extra}</Text>}
      <Text style={styles.metricDescription}>{description}</Text>
    </Card>
  );
}

// 화면: 날씨 상세 (홈의 날씨 카드를 눌렀을 때)
export default function WeatherDetailScreen() {
  const { coords, loading: locationLoading } = useUserLocation();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (locationLoading) return;
    let cancelled = false;
    setLoading(true);
    api.getWeather(coords ?? undefined).then((w) => {
      if (cancelled) return;
      setWeather(w);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [locationLoading, coords]);

  if (loading) {
    return (
      <ScreenContainer scroll={false} style={styles.loadingContainer}>
        <ActivityIndicator color={colors.sage} />
        <Text style={styles.observedAt}>날씨를 불러오는 중...</Text>
      </ScreenContainer>
    );
  }

  if (!weather) {
    return (
      <ScreenContainer scroll={false} style={styles.loadingContainer}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textTertiary} />
        <Text style={styles.unavailableTitle}>날씨 정보를 불러올 수 없어요</Text>
        <Text style={styles.observedAt}>잠시 후 다시 시도해주세요</Text>
      </ScreenContainer>
    );
  }

  const observedTime = new Date(weather.observedAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>날씨 상세</Text>
        <View style={{ width: 22 }} />
      </View>

      <View>
        <Text style={styles.regionName}>{weather.regionName}</Text>
        <Text style={styles.observedAt}>{`${observedTime} 기준`}</Text>
      </View>

      <MetricCard
        icon="sunny-outline"
        label="오늘 최고 자외선지수"
        value={weather.uvIndexPeak ?? weather.uvIndex}
        unit="지수"
        status={weather.uvStatusPeak ?? weather.uvStatus}
        extra={
          typeof weather.uvIndexPeakHour === 'number'
            ? `${weather.uvIndexPeakHour}시경 예상`
            : undefined
        }
        description="자외선은 피부 세포 신호전달체계에 영향을 줘서 광노화·색소침착을 유발할 수 있어요. 지수가 높을수록 자외선 차단제를 자주 덧발라주세요."
      />

      <MetricCard
        icon="cloud-outline"
        label="오존"
        value={weather.ozonePpm}
        unit="ppm"
        status={weather.ozoneStatus}
        description="오존 농도가 높으면 피부 자극과 염증이 생기기 쉬워요. 외출 후 세안을 신경 써주세요."
      />

      <MetricCard
        icon="layers-outline"
        label="미세먼지"
        value={weather.pm10}
        unit="㎍/㎥"
        status={weather.pm10Status}
        description="입자가 상대적으로 커서 모공을 자극할 수 있어요."
      />

      <MetricCard
        icon="ellipse-outline"
        label="초미세먼지"
        value={weather.pm25}
        unit="㎍/㎥"
        status={weather.pm25Status}
        description="입자가 작아 모공 깊숙이 침투해 활성산소를 만들고 콜라겐 분해를 촉진할 수 있다는 관찰 연구가 있어요."
      />

      {typeof weather.caiValue === 'number' && weather.caiStatus && (
        <MetricCard
          icon="stats-chart-outline"
          label="통합대기환경지수"
          value={weather.caiValue}
          unit="지수"
          status={weather.caiStatus}
          description="오존·미세먼지 등 여러 오염물질을 하나로 합친 종합 점수예요."
        />
      )}

      {(typeof weather.no2Value === 'number' ||
        typeof weather.so2Value === 'number' ||
        typeof weather.coValue === 'number') && (
        <Card>
          <Text style={styles.extraTitle}>추가 대기질 정보</Text>
          <View style={styles.extraList}>
            {typeof weather.no2Value === 'number' && (
              <View style={styles.extraRow}>
                <Text style={styles.extraLabel}>이산화질소(NO2)</Text>
                <Text style={styles.extraValue}>{weather.no2Value} ppm</Text>
              </View>
            )}
            {typeof weather.so2Value === 'number' && (
              <View style={styles.extraRow}>
                <Text style={styles.extraLabel}>아황산가스(SO2)</Text>
                <Text style={styles.extraValue}>{weather.so2Value} ppm</Text>
              </View>
            )}
            {typeof weather.coValue === 'number' && (
              <View style={styles.extraRow}>
                <Text style={styles.extraLabel}>일산화탄소(CO)</Text>
                <Text style={styles.extraValue}>{weather.coValue} ppm</Text>
              </View>
            )}
          </View>
        </Card>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  unavailableTitle: { ...typography.headline, color: colors.textPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { ...typography.subtitle, color: colors.textPrimary },
  regionName: { ...typography.displaySm, color: colors.textPrimary },
  observedAt: { ...typography.bodySm, color: colors.textTertiary, marginTop: 2 },
  metricCard: { gap: spacing.sm },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: { ...typography.subtitle, color: colors.textPrimary, flex: 1 },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusPillUnavailable: { backgroundColor: colors.gray100 },
  statusPillText: { ...typography.caption, fontWeight: '700' },
  statusPillTextUnavailable: { color: colors.gray400 },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  metricValue: { ...typography.displaySm, color: colors.textPrimary },
  metricUnit: { ...typography.bodySm, color: colors.textSecondary },
  metricUnavailableText: { ...typography.bodySm, color: colors.gray400 },
  metricExtra: { ...typography.bodySm, color: colors.sageDark, fontWeight: '600' },
  metricDescription: { ...typography.bodySm, color: colors.textSecondary },
  extraTitle: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  extraList: { gap: spacing.sm },
  extraRow: { flexDirection: 'row', justifyContent: 'space-between' },
  extraLabel: { ...typography.bodySm, color: colors.textSecondary },
  extraValue: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
});
