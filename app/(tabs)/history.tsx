import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { EvidenceBadge } from '../../src/components/EvidenceBadge';
import { LandmarkOverlay } from '../../src/components/LandmarkOverlay';
import { RetryButton } from '../../src/components/RetryButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { AIR_STATUS_COLOR, UV_LEVEL_COLOR } from '../../src/lib/air-status';
import { formatDateKo, monthBounds, todayKst } from '../../src/lib/kst-date';
import { colors, radius, spacing, typography } from '../../src/theme';
import type {
  AirStatus,
  CalendarDayHistory,
  CalendarDiagnosis,
  CalendarWeather,
  ScoreSeries,
} from '../../src/types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 화면 8: 마이 히스토리 — N8 날짜별 통합 히스토리(날씨·분석·추천·이미지·랜드마크) + score-series 추이
export default function HistoryScreen() {
  const today = useMemo(() => todayKst(), []);
  const [currentMonth, setCurrentMonth] = useState(today.slice(0, 7));

  // 서버 집계 시계열 (N8)
  const [scoreSeries, setScoreSeries] = useState<ScoreSeries | null>(null);
  // F75: 조회 실패(null)를 "데이터 없음"과 구분해 재시도를 제공한다.
  const [seriesFailed, setSeriesFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 선택 날짜의 통합 히스토리 (N8)
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayHistory, setDayHistory] = useState<CalendarDayHistory | null>(null);
  // 첫 렌더에서 useEffect가 오늘 날짜를 선택하기 전에 에러 카드가 1프레임 깜빡이지 않도록 true로 시작한다.
  const [dayLoading, setDayLoading] = useState(true);

  // 날짜를 빠르게 연타하면 늦게 도착한 이전 요청이 최신 요청을 덮어쓸 수 있다.
  // 요청 시퀀스를 추적해 stale 응답을 폐기한다.
  const dayRequestSeq = useRef(0);
  const initialLoadDoneRef = useRef(false);

  const load = useCallback(async () => {
    const series = await api.getScoreSeries(monthBounds(currentMonth));
    setScoreSeries(series);
    setSeriesFailed(series === null);
  }, [currentMonth]);

  const loadDay = useCallback(async (date: string) => {
    const seq = ++dayRequestSeq.current;
    setDayLoading(true);
    const result = await api.getHistoryByDate(date);
    if (seq !== dayRequestSeq.current) return; // 이전 요청이 늦게 도착한 경우 폐기
    setDayHistory(result);
    setDayLoading(false);
  }, []);

  const selectDay = useCallback(
    (date: string) => {
      setSelectedDate(date);
      loadDay(date);
    },
    [loadDay],
  );

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    // 기본으로 오늘 날짜를 선택해 바로 내용이 보이게 한다.
    selectDay(today);
    initialLoadDoneRef.current = true;
    return () => {
      dayRequestSeq.current += 1; // 언마운트 후 도착하는 응답도 폐기
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * F67: 상세에서 기록을 지우고 돌아오면 목록·추이가 그대로여서 지운 기록이 남아 보인다.
   * 포커스 복귀 시 다시 불러온다. 첫 진입은 위 effect가 처리하므로 건너뛴다(F52와 같은 방식).
   */
  useFocusEffect(
    useCallback(() => {
      if (!initialLoadDoneRef.current) return;
      void load();
      if (selectedDate) void loadDay(selectedDate);
    }, [load, loadDay, selectedDate]),
  );

  const calendarDays = useMemo(() => {
    const { to } = monthBounds(currentMonth);
    const count = Number(to.slice(-2));
    const firstWeekday = new Date(`${currentMonth}-01T12:00:00+09:00`).getDay();
    return [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: count }, (_, index) => `${currentMonth}-${String(index + 1).padStart(2, '0')}`)];
  }, [currentMonth]);
  const recordedDates = useMemo(() => new Set(scoreSeries?.points.map((point) => point.date) ?? []), [scoreSeries]);
  // F40: moveMonth를 useCallback으로 감싸 최신 상태를 안정적으로 읽는다.
  // (PanResponder는 첫 렌더에 1회만 생성되므로 slideInMonth처럼 안정적인 콜백만 참조한다.)
  const moveMonth = useCallback((offset: number) => {
    setCurrentMonth((prev) => {
      const [year, month] = prev.split('-').map(Number);
      const next = new Date(year, month - 1 + offset, 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  // F37: 캘린더 좌우 스와이프로 앞/뒤 월 이동.
  // 가로 움직임이 우세할 때만 잡아서 세로 ScrollView(pull-to-refresh 포함)와 충돌하지 않게 한다.
  // F40: 릴리스에서 월 이동을 1회만 처리하도록 swipeHandledRef 가드 사용.
  const swipeX = useRef(new Animated.Value(0)).current;
  const cardWidthRef = useRef(0);
  const swipeHandledRef = useRef(false);
  // F50: 월이 바뀌면 새 달이 스와이프 방향과 반대쪽(다음 달 = 오른쪽, 이전 달 = 왼쪽)에서
  // 밀려 들어오도록 translateX를 오프셋에서 시작해 스프링으로 0까지 스냅한다.
  // overshootClamping으로 튕김 없이 매끄럽게 들어온다.
  const slideInMonth = useCallback(
    (offset: number) => {
      const width = cardWidthRef.current || 320;
      moveMonth(offset);
      swipeX.setValue(offset * width);
      Animated.spring(swipeX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 26,
        stiffness: 300,
        overshootClamping: true,
      }).start();
    },
    [moveMonth, swipeX],
  );
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        swipeHandledRef.current = false;
      },
      onPanResponderMove: (_, g) => swipeX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (swipeHandledRef.current) return;
        swipeHandledRef.current = true;
        const width = cardWidthRef.current || 320;
        if (g.dx <= -width * 0.25) {
          slideInMonth(1);
        } else if (g.dx >= width * 0.25) {
          slideInMonth(-1);
        } else {
          Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (selectedDate) await loadDay(selectedDate);
    setRefreshing(false);
  }, [load, loadDay, selectedDate]);

  // score-series 기반 추이 폴리라인
  const trend = useMemo(() => {
    const pts = scoreSeries?.points ?? [];
    if (pts.length < 2) return null;
    const width = 300;
    const height = 60;
    const max = Math.max(...pts.map((p) => p.overallScore));
    const min = Math.min(...pts.map((p) => p.overallScore));
    const range = max - min || 1;
    const step = width / (pts.length - 1);
    const points = pts
      .map((p, i) => `${i * step},${height - ((p.overallScore - min) / range) * height}`)
      .join(' ');
    return { width, height, points, from: scoreSeries!.from, to: scoreSeries!.to };
  }, [scoreSeries]);

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <Text style={styles.title}>마이 히스토리</Text>

      {seriesFailed ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>스코어 추이를 불러올 수 없어요</Text>
          {/* F75: 오류 상태 재시도 일관화 — 홈·추천과 같은 방식 */}
          <RetryButton onPress={() => void load()} />
        </Card>
      ) : (
        trend && (
          <Card style={styles.trendCard}>
            <Text style={styles.trendLabel}>스코어 변화 추이</Text>
            <Svg
              width="100%"
              height={trend.height}
              viewBox={`0 0 ${trend.width} ${trend.height}`}
              preserveAspectRatio="none"
            >
              <Polyline points={trend.points} fill="none" stroke={colors.sage} strokeWidth={2.5} />
            </Svg>
            <Text style={styles.trendRange}>
              {formatDateKo(trend.from)} ~ {formatDateKo(trend.to)}
            </Text>
          </Card>
        )
      )}

      <Text style={styles.sectionTitle}>날짜별 기록</Text>
      <Card style={styles.calendarCard}>
        <Animated.View
          onLayout={(e) => {
            cardWidthRef.current = e.nativeEvent.layout.width;
          }}
          style={{ transform: [{ translateX: swipeX }] }}
          {...panResponder.panHandlers}
        >
        <View style={styles.calendarHeader}>
          <Pressable onPress={() => slideInMonth(-1)} hitSlop={10}><Ionicons name="chevron-back" size={20} color={colors.textSecondary} /></Pressable>
          <Text style={styles.calendarTitle}>{currentMonth.slice(0, 4)}년 {Number(currentMonth.slice(5, 7))}월</Text>
          <Pressable onPress={() => slideInMonth(1)} hitSlop={10}><Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /></Pressable>
        </View>
        <View style={styles.weekRow}>{WEEKDAYS.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
        <View style={styles.calendarGrid}>
        {calendarDays.map((date, index) => {
          if (!date) return <View key={`empty-${index}`} style={styles.calendarDay} />;
          const active = date === selectedDate;
          return (
            <Pressable
              key={date}
              onPress={() => selectDay(date)}
              style={[styles.calendarDay, active && styles.dateChipActive]}
            >
              <Text style={[styles.dateNum, active && styles.dateTextActive]}>
                {Number(date.slice(-2))}
              </Text>
              {recordedDates.has(date) && <View style={[styles.recordDot, active && styles.recordDotActive]} />}
            </Pressable>
          );
        })}
        </View>
        </Animated.View>
      </Card>

      {dayLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.sage} />
        </View>
      ) : dayHistory === null ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>기록을 불러올 수 없어요</Text>
          <Text style={styles.emptyHint}>네트워크를 확인하거나 다시 로그인해주세요</Text>
          {/* F75: 오류 상태 재시도 일관화 — 탭 이탈 없이 같은 자리에서 재시도 */}
          <RetryButton onPress={() => selectedDate && void loadDay(selectedDate)} />
        </Card>
      ) : dayHistory.diagnoses.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>이 날짜에는 기록이 없어요</Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {dayHistory.diagnoses.map((d) => (
            <DiagnosisCard key={d.id} diagnosis={d} />
          ))}
        </View>
      )}

    </ScreenContainer>
  );
}

// ── N8 통합 히스토리 카드 ──────────────────────────
// F39: 진단 카드 = 랜드마크 썸네일(좌) + 시각·점수·상태(우) 가로 카드.
// 전체 카드 탭 또는 “상세기록 보기” → app/diagnosis/[id] 상세 화면 이동.
// 부위 분석·날씨·추천·제품은 상세 화면에서 정돈된 레이아웃으로 표시한다.
// F39(재확정): 카드 = 랜드마크 이미지(좌, 크게) + 추천 요약(우).
// “몇 시 촬영·점수” 텍스트는 제거 — 상세 화면에서 확인한다.
// 하루에 보통 1건이므로 한 진단이 화면에 잘 들어오는 크기로.
function DiagnosisCard({ diagnosis: d }: { diagnosis: CalendarDiagnosis }) {
  // capturedAt은 UTC ISO — Asia/Seoul(UTC+9) 기준 날짜로 변환해야 서버 집계(history/:date)와 일치한다.
  const capturedDate = new Date(new Date(d.capturedAt).getTime() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const openDetail = () =>
    router.push({ pathname: `/diagnosis/${d.id}`, params: { date: capturedDate } });
  const recs = d.recommendations;

  return (
    <Pressable onPress={openDetail} style={({ pressed }) => [pressed && styles.diagCardPressed]}>
      <Card style={styles.diagCard}>
        <View style={styles.diagRow}>
          <MediaThumb diagnosis={d} />
          <View style={styles.diagInfo}>
            {/* F57: 촬영 당시 날씨 — 피부에 영향 큰 지표 4개 (추천은 상세 화면) */}
            {d.weather ? (
              <>
                <View style={styles.weatherHeader}>
                  <Ionicons name="partly-sunny-outline" size={14} color={colors.sageDark} />
                  <Text style={styles.weatherHeaderText} numberOfLines={1}>
                    {[d.weather.regionName, d.weather.districtName].filter(Boolean).join(' ')}
                  </Text>
                </View>
                <WeatherSummaryGrid weather={d.weather} />
              </>
            ) : recs.length > 0 ? (
              <>
                {recs.slice(0, 3).map((r) => (
                  <View key={r.id} style={styles.recSummaryRow}>
                    <EvidenceBadge grade={r.grade} />
                    <Text style={styles.recSummaryTitle} numberOfLines={1}>
                      {r.title}
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.noRec}>이 기록에는 추천이 없어요</Text>
            )}
            <View style={styles.detailButton}>
              <Text style={styles.detailButtonText}>상세기록 보기</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.sageDark} />
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
// F57: 촬영 당시 날씨 요약 — 자외선·미세먼지·초미세먼지·오존 (2×2 그리드, 상태색)
function WeatherSummaryGrid({ weather }: { weather: CalendarWeather }) {
  // F64: 자외선과 대기질은 등급 체계가 달라 색상 맵도 다르다. 셀마다 지표에 맞는
  // 맵으로 색을 미리 정해 담는다 — 한 배열에 두 체계의 등급을 섞어 담으면 표기가 어긋난다.
  const uvLevel = weather.uvStatusPeak ?? weather.uvStatus ?? null;
  const airColor = (status: AirStatus | null | undefined): string =>
    status ? AIR_STATUS_COLOR[status] : colors.textTertiary;

  // F70: 값이 없을 때 이유를 구별해 보여준다. 수집 실패를 `-`로만 그리면
  // 사용자는 앱이 값을 못 불러오는 것으로 읽는다.
  const missing = (collectionFailed?: boolean): string =>
    collectionFailed ? '수집실패' : '—';

  const items: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    color: string;
  }[] = [
    {
      icon: 'sunny-outline',
      label: '자외선',
      value:
        weather.uvIndexPeak != null
          ? String(weather.uvIndexPeak)
          : weather.uvIndex != null
            ? String(weather.uvIndex)
            : missing(weather.uvCollectionFailed),
      color: uvLevel ? UV_LEVEL_COLOR[uvLevel] : colors.textTertiary,
    },
    {
      icon: 'ellipse-outline',
      label: '미세먼지',
      value:
        weather.pm10 != null
          ? String(Math.round(weather.pm10))
          : missing(weather.airCollectionFailed),
      color: airColor(weather.pm10Status),
    },
    {
      icon: 'layers-outline',
      label: '초미세먼지',
      value:
        weather.pm25 != null
          ? String(Math.round(weather.pm25))
          : missing(weather.airCollectionFailed),
      color: airColor(weather.pm25Status),
    },
    {
      icon: 'cloud-outline',
      label: '오존',
      value:
        weather.ozonePpm != null
          ? String(weather.ozonePpm)
          : missing(weather.airCollectionFailed),
      color: airColor(weather.ozoneStatus),
    },
  ];

  return (
    <View style={styles.weatherGrid}>
      {items.map((it) => {
        return (
          <View key={it.label} style={styles.weatherCell}>
            <View style={[styles.weatherIconWrap, { backgroundColor: it.color + '22' }]}>
              <Ionicons name={it.icon} size={14} color={it.color} />
            </View>
            <View style={styles.weatherCellText}>
              <Text style={styles.weatherValue} numberOfLines={1}>
                {it.value}
              </Text>
              <Text style={styles.weatherLabel} numberOfLines={1}>
                {it.label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// 썸네일 — 이미지(가능 시) + 랜드마크 오버레이. 랜드마크만 있으면 점만 표시.
/**
 * F65: 썸네일에서는 478점을 다 그리지 않는다.
 *
 * 140×160 박스에서는 점이 뭉쳐 덩어리로만 보이고, 카드마다 478개 SVG 노드가 생겨
 * 목록 스크롤이 무거워진다. 고르게 솎으면 얼굴 윤곽은 그대로 읽힌다.
 */
const THUMB_MAX_POINTS = 80;

function MediaThumb({ diagnosis: d }: { diagnosis: CalendarDiagnosis }) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const img = d.image;
  const landmarks = d.landmarks;
  const expired = img ? new Date(img.expiresAt).getTime() <= Date.now() : false;
  const hasImage = Boolean(img) && !expired;

  if (!img && !landmarks) {
    return (
      <View style={styles.thumbBox}>
        <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} />
      </View>
    );
  }

  return (
    <View
      style={styles.thumbBox}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox({ width, height });
      }}
    >
      {img && !expired ? (
        <Image
          source={{ uri: img.url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={(e) => {
            const { width, height } = e.nativeEvent.source;
            if (width > 0 && height > 0) setImageSize({ width, height });
          }}
        />
      ) : (
        // 이미지 만료 or 랜드마크만 있는 경우 — 회색 배경에 점만 표시
        <Ionicons name="scan-outline" size={20} color={colors.textTertiary} />
      )}
      {landmarks && (
        <LandmarkOverlay
          points={landmarks.points}
          box={box}
          imageSize={hasImage ? imageSize : null}
          dotRadius={1.5}
          maxPoints={THUMB_MAX_POINTS}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.displaySm, color: colors.textPrimary },
  sectionTitle: { ...typography.headline, color: colors.textPrimary },
  trendCard: { gap: spacing.sm },
  trendLabel: { ...typography.subtitle, color: colors.textPrimary },
  trendRange: { ...typography.caption, color: colors.textTertiary },
  calendarCard: { gap: spacing.sm },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarTitle: { ...typography.subtitle, color: colors.textPrimary },
  weekRow: { flexDirection: 'row' },
  weekday: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', width: '14.2857%' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDay: { width: '14.2857%', height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, gap: 2 },
  dateChipActive: { backgroundColor: colors.sage, borderColor: colors.sage },
  dateNum: { ...typography.subtitle, color: colors.textPrimary },
  dateTextActive: { color: colors.textInverse },
  recordDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sageDark },
  recordDotActive: { backgroundColor: colors.textInverse },
  loadingRow: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyCard: { gap: spacing.xs, alignItems: 'center', paddingVertical: spacing.xl },
  emptyText: { ...typography.bodySm, color: colors.textTertiary, textAlign: 'center' },
  emptyHint: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: { ...typography.body, color: colors.textPrimary },
  score: { ...typography.headline, color: colors.sageDark },

  // 진단 카드 (F39 재확정 — 랜드마크 크게 + 추천 요약)
  diagCard: { gap: spacing.md },
  diagCardPressed: { opacity: 0.85 },
  diagRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  thumbBox: {
    width: 140,
    minHeight: 160,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagInfo: { flex: 1, gap: spacing.sm, alignItems: 'flex-start' },
  weatherHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  weatherHeaderText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600', flexShrink: 1 },
  weatherGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    width: '100%',
  },
  weatherCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    width: '47%',
    backgroundColor: colors.gray50 ?? colors.gray100,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  weatherIconWrap: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherCellText: { flex: 1, gap: 0 },
  weatherValue: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '700' },
  weatherLabel: { ...typography.caption, color: colors.textTertiary },
  recSummaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  recSummaryTitle: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600', flex: 1 },
  noRec: { ...typography.caption, color: colors.textTertiary },
  detailButton: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.sage,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  detailButtonText: { ...typography.caption, color: colors.sageDark, fontWeight: '700' },
});
