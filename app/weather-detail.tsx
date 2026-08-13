import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../src/api/client';
import { Card } from '../src/components/Card';
import { RetryButton } from '../src/components/RetryButton';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { useToast } from '../src/components/Toast';
import { useUserLocation } from '../src/hooks/useUserLocation';
import {
  AIR_STATUS_COLOR,
  AIR_STATUS_LABEL,
  AIR_STATUS_ORDER,
  isAirConcerning,
  UV_LEVEL_COLOR,
  UV_LEVEL_LABEL,
  UV_LEVEL_ORDER,
} from '../src/lib/air-status';
import { colors, radius, spacing, typography } from '../src/theme';
import type { AirStatus, UvLevel, WeatherSnapshot } from '../src/types';

// R5: 등급 판정의 단일 출처는 서버(weather-status.policy.ts)다. 프론트는 서버가 내려준
// uvStatus/pm10Status/... 를 그대로 쓰고, 여기서는 게이지 눈금(maxCap)만 갖는다.
// maxCap은 등급 경계가 아니라 막대의 오른쪽 끝에 해당하는 표시용 상한이다.
const UV_MAX = 11;
const PM10_MAX = 150;
const PM25_MAX = 75;
const OZONE_MAX = 0.15;
const CAI_MAX = 250;

/**
 * F64: 게이지 눈금은 지표마다 다르다. 자외선은 5단계(낮음~위험), 대기질은
 * 4단계(좋음~매우나쁨)라 눈금 라벨을 하드코딩할 수 없다. 판별 유니온으로 받아
 * `status`가 스케일에 맞는 타입인지 컴파일러가 검사하게 한다.
 */
type GaugeScale =
  | { scale: 'air'; status: AirStatus | null | undefined }
  | { scale: 'uv'; status: UvLevel | null | undefined };

function StatusBar(props: { value: number; maxCap: number } & GaugeScale) {
  const { value, maxCap } = props;
  const clamped = Math.max(0, Math.min(value, maxCap));
  const pos = (maxCap > 0 ? clamped / maxCap : 0) * 100;
  const color = props.status
    ? props.scale === 'uv'
      ? UV_LEVEL_COLOR[props.status]
      : AIR_STATUS_COLOR[props.status]
    : colors.gray400;
  const legend =
    props.scale === 'uv'
      ? UV_LEVEL_ORDER.map((level) => UV_LEVEL_LABEL[level])
      : AIR_STATUS_ORDER.map((status) => AIR_STATUS_LABEL[status]);
  return (
    <View style={styles.barTrack}>
      <View style={styles.barFill} />
      {/* 현재 값 마커 */}
      <View style={[styles.barMarker, { left: `${pos}%`, backgroundColor: color }]} />
      <View style={styles.barLegend}>
        {legend.map((label) => (
          <Text key={label} style={styles.barLegendText}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  status,
  description,
  extra,
  maxCap,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | null | undefined;
  unit: string;
  status: AirStatus | null | undefined;
  description: string;
  extra?: string;
  maxCap?: number;
}) {
  const statusColor = status ? AIR_STATUS_COLOR[status] : colors.gray400;
  return (
    <Card style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <View style={[styles.metricIconWrap, { backgroundColor: statusColor + '22' }]}>
          <Ionicons name={icon} size={20} color={statusColor} />
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
        {status ? (
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>
              {AIR_STATUS_LABEL[status]}
            </Text>
          </View>
        ) : (
          <View style={[styles.statusPill, styles.statusPillUnavailable]}>
            <Text style={[styles.statusPillText, styles.statusPillTextUnavailable]}>분석 중</Text>
          </View>
        )}
      </View>
      {typeof value === 'number' ? (
        <>
          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValue, { color: statusColor }]}>{value}</Text>
            <Text style={styles.metricUnit}>{unit}</Text>
          </View>
          {extra && <Text style={[styles.metricExtra, { color: colors.sageDark }]}>{extra}</Text>}
          {maxCap ? (
            <StatusBar scale="air" value={value} status={status} maxCap={maxCap} />
          ) : null}
          <Text style={styles.metricDescription}>{description}</Text>
        </>
      ) : (
        <Text style={styles.metricUnavailableText}>값을 분석하고 있어요</Text>
      )}
    </Card>
  );
}

// 현재 시간대 자외선 + 오늘 최고 자외선 — 히어로 카드. "예상" 표현 제거, 공식값 그대로 (F41).
function UvHeroCard({ weather }: { weather: WeatherSnapshot }) {
  const current = weather.uvIndex;
  const currentStatus = weather.uvStatus;
  const peak = weather.uvIndexPeak ?? weather.uvIndex;
  const peakStatus = weather.uvStatusPeak ?? weather.uvStatus;
  const peakHour = weather.uvIndexPeakHour;
  const color = peakStatus ? UV_LEVEL_COLOR[peakStatus] : colors.gray400;
  const currentColor = currentStatus ? UV_LEVEL_COLOR[currentStatus] : colors.gray400;
  return (
    <Card style={styles.heroCard}>
      <View style={styles.heroTop}>
        <View style={styles.heroIconWrap}>
          <Ionicons name="sunny-outline" size={26} color={color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroLabel}>자외선지수</Text>
          {typeof peakHour === 'number' && (
            <Text style={styles.heroSub}>오늘 최고 시각 {peakHour}시</Text>
          )}
        </View>
      </View>
      {typeof current === 'number' || typeof peak === 'number' ? (
        <View style={styles.heroValueSplit}>
          <View style={styles.heroValueCell}>
            <Text style={styles.heroValueCellLabel}>지금</Text>
            {typeof current === 'number' ? (
              <View style={styles.heroValueRow}>
                <Text style={[styles.heroValue, { color: currentColor }]}>{current}</Text>
                <Text style={styles.heroUnit}>지수</Text>
              </View>
            ) : (
              <Text style={styles.metricUnavailableText}>측정 불가</Text>
            )}
            {currentStatus && (
              <View style={[styles.statusPill, { backgroundColor: currentColor + '22' }]}>
                <Text style={[styles.statusPillText, { color: currentColor }]}>
                  {UV_LEVEL_LABEL[currentStatus]}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.heroValueDivider} />
          <View style={styles.heroValueCell}>
            <Text style={styles.heroValueCellLabel}>오늘 최고</Text>
            {typeof peak === 'number' ? (
              <View style={styles.heroValueRow}>
                <Text style={[styles.heroValue, { color }]}>{peak}</Text>
                <Text style={styles.heroUnit}>지수</Text>
              </View>
            ) : (
              <Text style={styles.metricUnavailableText}>측정 불가</Text>
            )}
            {peakStatus && (
              <View style={[styles.statusPill, { backgroundColor: color + '22' }]}>
                <Text style={[styles.statusPillText, { color }]}>
                  {UV_LEVEL_LABEL[peakStatus]}
                </Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <Text style={styles.metricUnavailableText}>값을 분석하고 있어요</Text>
      )}
      {typeof peak === 'number' && (
        <StatusBar scale="uv" value={peak} status={peakStatus} maxCap={UV_MAX} />
      )}
    </Card>
  );
}

// N53: 초단기실황 기온·습도 — 등급(status) 개념이 없어서 MetricCard 대신 별도 카드.
function NowcastCard({ weather }: { weather: WeatherSnapshot }) {
  const hasTemperature = typeof weather.temperature === 'number';
  const hasHumidity = typeof weather.humidity === 'number';
  if (!hasTemperature && !hasHumidity) {
    // F70과 같은 원칙: "수집 실패"와 "값 없음"을 구분해서 보여준다.
    const message = weather.nowcastCollectionFailed
      ? '기온·습도 수집에 실패했어요 — 잠시 후 새로고침해주세요'
      : '기온·습도 값을 불러올 수 없어요';
    return (
      <Card style={styles.nowcastCard}>
        <Text style={styles.metricUnavailableText}>{message}</Text>
      </Card>
    );
  }
  return (
    <Card style={styles.nowcastCard}>
      <View style={styles.nowcastItem}>
        <Ionicons name="thermometer-outline" size={20} color={colors.sageDark} />
        <Text style={styles.nowcastLabel}>기온</Text>
        <Text style={styles.nowcastValue}>
          {hasTemperature ? `${weather.temperature}°C` : '—'}
        </Text>
      </View>
      <View style={styles.nowcastDivider} />
      <View style={styles.nowcastItem}>
        <Ionicons name="water-outline" size={20} color={colors.sageDark} />
        <Text style={styles.nowcastLabel}>습도</Text>
        <Text style={styles.nowcastValue}>
          {hasHumidity ? `${weather.humidity}%` : '—'}
        </Text>
      </View>
    </Card>
  );
}

// F41: 지표 조합 → 액션 TIP
function SkinTip({ weather }: { weather: WeatherSnapshot }) {
  const tips: string[] = [];
  const uv = weather.uvIndexPeak ?? weather.uvIndex;
  if (typeof uv === 'number') {
    if (uv >= 6) {
      tips.push('자외선이 높아요 — 차단제를 2~3시간마다 덧발라주세요');
    } else if (uv >= 3) {
      tips.push('자외선이 보통 수준이에요 — 외출 전 차단제를 발라주세요');
    }
  }
  // '매우나쁨'이 생기면서 `=== 'bad'` 비교가 최악 구간을 놓치게 됐다 — F64.
  const pm = weather.pm25Status ?? weather.pm10Status;
  if (isAirConcerning(pm)) {
    tips.push('미세먼지가 나빠요 — 외출 후 순한 세안으로 피부를 정돈해주세요');
  }
  if (isAirConcerning(weather.ozoneStatus)) {
    tips.push('오존 농도가 높아요 — 외출 후 진정 세안을 신경 써주세요');
  }
  // N53: 습도 기반 보습 팁 — 40% 미만은 건조 구간(기상청 생활기상 기준 참고).
  if (typeof weather.humidity === 'number' && weather.humidity < 40) {
    tips.push('공기가 건조해요 — 보습제를 평소보다 꼼꼼히 발라주세요');
  }
  if (tips.length === 0) {
    tips.push('오늘은 대기 환경이 양호해요 — 평소 루틴을 유지하세요');
  }
  return (
    <Card style={styles.tipCard}>
      <View style={styles.tipHeader}>
        <Ionicons name="bulb-outline" size={18} color={colors.sageDark} />
        <Text style={styles.tipTitle}>오늘 피부 관리 TIP</Text>
      </View>
      {tips.map((t, i) => (
        <View key={i} style={styles.tipRow}>
          <View style={styles.tipDot} />
          <Text style={styles.tipText}>{t}</Text>
        </View>
      ))}
    </Card>
  );
}

// 화면: 날씨 상세 (홈의 날씨 카드를 눌렀을 때)
export default function WeatherDetailScreen() {
  const { coords, loading: locationLoading } = useUserLocation();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // F52: in-flight 가드·로드 완료·마운트 유지 — 중복 갱신 방지 + 오류 시 화면 유지
  const loadInFlightRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const mountedRef = useRef(true);
  const { showToast } = useToast();

  const loadWeather = useCallback(
    async (mode: 'initial' | 'refresh') => {
      // F52: 이미 갱신 중이면 중복 호출을 차단한다.
      if (locationLoading || loadInFlightRef.current) return;
      loadInFlightRef.current = true;
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      try {
        const result = await api.getWeather(coords ?? undefined);
        if (!mountedRef.current) return;
        hasLoadedRef.current = true;
        setWeather(result.status === 'ok' ? result.data : null);
      } catch {
        if (!mountedRef.current) return;
        // F52: 오류 시 기존 정보 유지 — 화면 블랭크 방지
        if (hasLoadedRef.current) {
          showToast('날씨를 새로고침하지 못했어요 — 기존 정보를 유지합니다', {
            type: 'error',
          });
        } else {
          setWeather(null); // 기존 에러 화면으로
        }
      } finally {
        if (mountedRef.current) {
          loadInFlightRef.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [locationLoading, coords, showToast],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (locationLoading) return;
    loadWeather('initial');
    return () => {
      mountedRef.current = false;
    };
  }, [locationLoading, loadWeather]);

  // F52: 포커스 복귀 시 1회 자동 갱신 (첫 진입은 위 effect가 처리).
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) return;
      loadWeather('refresh');
    }, [loadWeather]),
  );

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
        <RetryButton onPress={() => loadWeather('initial')} disabled={refreshing} />
      </ScreenContainer>
    );
  }

  const observedTime = new Date(weather.observedAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const sourceLabel =
    weather.source === 'UNAVAILABLE' ? '측정 불가' : weather.source === 'LIVE' ? 'LIVE' : 'CACHED';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>날씨 상세</Text>
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.sage} />
        ) : (
          <Pressable
            onPress={() => loadWeather('refresh')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="새로고침"
          >
            <Ionicons name="refresh" size={22} color={colors.sageDark} />
          </Pressable>
        )}
      </View>

      <View style={styles.regionRow}>
        <Text style={styles.regionName}>
          {[weather.regionName, weather.districtName].filter(Boolean).join(' ')}
        </Text>
        <View
          style={[
            styles.sourceBadge,
            weather.source === 'LIVE' ? styles.sourceLive : styles.sourceCached,
          ]}
        >
          <Text style={styles.sourceText}>{sourceLabel}</Text>
        </View>
      </View>
      <Text style={styles.observedAt}>{`${observedTime} 기준 · 공식 실시간 데이터`}</Text>

      {/* F41: 히어로 — 오늘 최고 자외선지수 (예상 표현 제거) */}
      <UvHeroCard weather={weather} />

      {/* N53: 기온·습도 실황 */}
      <NowcastCard weather={weather} />

      <MetricCard
        icon="cloud-outline"
        label="오존"
        value={weather.ozonePpm}
        unit="ppm"
        status={weather.ozoneStatus}
        maxCap={OZONE_MAX}
        description="오존 농도가 높으면 피부 자극과 염증이 생기기 쉬워요. 외출 후 세안을 신경 써주세요."
      />

      <MetricCard
        icon="layers-outline"
        label="미세먼지"
        value={weather.pm10}
        unit="㎍/㎥"
        status={weather.pm10Status}
        maxCap={PM10_MAX}
        description="입자가 상대적으로 커서 모공을 자극할 수 있어요."
      />

      <MetricCard
        icon="ellipse-outline"
        label="초미세먼지"
        value={weather.pm25}
        unit="㎍/㎥"
        status={weather.pm25Status}
        maxCap={PM25_MAX}
        description="입자가 작아 모공 깊숙이 침투해 활성산소를 만들고 콜라겐 분해를 촉진할 수 있다는 관찰 연구가 있어요."
      />

      {typeof weather.caiValue === 'number' && weather.caiStatus && (
        <MetricCard
          icon="stats-chart-outline"
          label="통합대기환경지수"
          value={weather.caiValue}
          unit="지수"
          status={weather.caiStatus}
          maxCap={CAI_MAX}
          description="오존·미세먼지 등 여러 오염물질을 하나로 합친 종합 점수예요."
        />
      )}

      <SkinTip weather={weather} />

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
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  regionName: { ...typography.displaySm, color: colors.textPrimary },
  sourceBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  sourceLive: { backgroundColor: colors.sageLight },
  sourceCached: { backgroundColor: colors.gray100 },
  sourceText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  observedAt: { ...typography.bodySm, color: colors.textTertiary, marginTop: 2 },

  // 히어로
  heroCard: { gap: spacing.md, backgroundColor: colors.sageLight },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { ...typography.subtitle, color: colors.textPrimary },
  heroSub: { ...typography.caption, color: colors.textSecondary },
  heroValueSplit: { flexDirection: 'row', alignItems: 'center' },
  heroValueCell: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  heroValueCellLabel: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
  heroValueDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.gray200,
    marginHorizontal: spacing.md,
  },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  heroValue: { ...typography.displaySm, fontSize: 30, lineHeight: 38, color: colors.textPrimary },
  heroUnit: { ...typography.bodySm, color: colors.textSecondary },

  // N53: 기온·습도 실황 카드
  nowcastCard: { flexDirection: 'row', alignItems: 'center' },
  nowcastItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nowcastLabel: { ...typography.bodySm, color: colors.textSecondary },
  nowcastValue: { ...typography.headline, color: colors.textPrimary },
  nowcastDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.gray200,
    marginHorizontal: spacing.md,
  },

  // 지표 카드
  metricCard: { gap: spacing.sm },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
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
  metricExtra: { ...typography.bodySm, fontWeight: '600' },
  metricDescription: { ...typography.bodySm, color: colors.textSecondary },

  // 기준치 눈금 바
  barTrack: { marginTop: spacing.xs, gap: 4 },
  barFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gray200,
    overflow: 'hidden',
  },
  barMarker: {
    position: 'absolute',
    top: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  barLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  barLegendText: { ...typography.caption, color: colors.textTertiary },

  // TIP
  tipCard: { gap: spacing.sm },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tipTitle: { ...typography.subtitle, color: colors.textPrimary },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.sageDark,
    marginTop: 5,
  },
  tipText: { ...typography.bodySm, color: colors.textSecondary, flex: 1 },

  extraTitle: { ...typography.subtitle, color: colors.textPrimary, marginBottom: spacing.sm },
  extraList: { gap: spacing.sm },
  extraRow: { flexDirection: 'row', justifyContent: 'space-between' },
  extraLabel: { ...typography.bodySm, color: colors.textSecondary },
  extraValue: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
});
