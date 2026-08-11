import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
import Svg, { Circle, Polyline } from 'react-native-svg';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors, radius, spacing, typography } from '../../src/theme';
import type {
  CalendarDayHistory,
  CalendarDiagnosis,
  ScoreSeries,
} from '../../src/types';

// Asia/Seoul(UTC+9) 기준 오늘부터 count일 전까지의 YYYY-MM-DD 목록.
function kstDateStrings(count: number): string[] {
  const days: string[] = [];
  const base = Date.now() + 9 * 3600 * 1000;
  for (let i = 0; i < count; i++) {
    days.push(new Date(base - i * 86400 * 1000).toISOString().slice(0, 10));
  }
  return days;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// '2026-08-01' → '8월 1일' — 날짜 표기 단위를 캘린더·추이에서 일관되게 맞춘다.
function formatDateKo(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${month}월 ${day}일`;
}

function monthBounds(month: string): { from: string; to: string } {
  const [year, value] = month.split('-').map(Number);
  const last = new Date(year, value, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '분석 중',
  COMPLETED: '완료',
  FAILED: '실패',
};

function statusLabel(s?: string | null): string {
  return s ? STATUS_LABEL[s] ?? s : '';
}

// 화면 8: 마이 히스토리 — N8 날짜별 통합 히스토리(날씨·분석·추천·이미지·랜드마크) + score-series 추이
export default function HistoryScreen() {
  const today = useMemo(() => kstDateStrings(1)[0], []);
  const [currentMonth, setCurrentMonth] = useState(today.slice(0, 7));

  // 서버 집계 시계열 (N8)
  const [scoreSeries, setScoreSeries] = useState<ScoreSeries | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 선택 날짜의 통합 히스토리 (N8)
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayHistory, setDayHistory] = useState<CalendarDayHistory | null>(null);
  // 첫 렌더에서 useEffect가 오늘 날짜를 선택하기 전에 에러 카드가 1프레임 깜빡이지 않도록 true로 시작한다.
  const [dayLoading, setDayLoading] = useState(true);

  // 날짜를 빠르게 연타하면 늦게 도착한 이전 요청이 최신 요청을 덮어쓸 수 있다.
  // 요청 시퀀스를 추적해 stale 응답을 폐기한다.
  const dayRequestSeq = useRef(0);

  const load = useCallback(async () => {
    setScoreSeries(await api.getScoreSeries(monthBounds(currentMonth)));
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
    return () => {
      dayRequestSeq.current += 1; // 언마운트 후 도착하는 응답도 폐기
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calendarDays = useMemo(() => {
    const { to } = monthBounds(currentMonth);
    const count = Number(to.slice(-2));
    const firstWeekday = new Date(`${currentMonth}-01T12:00:00+09:00`).getDay();
    return [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: count }, (_, index) => `${currentMonth}-${String(index + 1).padStart(2, '0')}`)];
  }, [currentMonth]);
  const recordedDates = useMemo(() => new Set(scoreSeries?.points.map((point) => point.date) ?? []), [scoreSeries]);
  // F40: moveMonth를 useCallback으로 감싸고 최신 참조를 ref에 보관한다.
  // PanResponder는 첫 렌더에 1회만 생성되므로(성능) 클로저가 moveMonthRef를 통해
  // 항상 최신 상태를 읽도록 한다 — stale 클로저로 인한 왼쪽 무반응/2개월 점프 해결.
  const moveMonth = useCallback((offset: number) => {
    setCurrentMonth((prev) => {
      const [year, month] = prev.split('-').map(Number);
      const next = new Date(year, month - 1 + offset, 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);
  const moveMonthRef = useRef(moveMonth);
  useEffect(() => {
    moveMonthRef.current = moveMonth;
  }, [moveMonth]);

  // F37: 캘린더 좌우 스와이프로 앞/뒤 월 이동.
  // 가로 움직임이 우세할 때만 잡아서 세로 ScrollView(pull-to-refresh 포함)와 충돌하지 않게 한다.
  // F40: 릴리스에서 월 이동을 1회만 처리하도록 swipeHandledRef 가드 사용.
  const swipeX = useRef(new Animated.Value(0)).current;
  const cardWidthRef = useRef(0);
  const swipeHandledRef = useRef(false);
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
          moveMonthRef.current(1);
          swipeX.setValue(0);
        } else if (g.dx >= width * 0.25) {
          moveMonthRef.current(-1);
          swipeX.setValue(0);
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

      {trend && (
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
          <Pressable onPress={() => moveMonth(-1)} hitSlop={10}><Ionicons name="chevron-back" size={20} color={colors.textSecondary} /></Pressable>
          <Text style={styles.calendarTitle}>{currentMonth.slice(0, 4)}년 {Number(currentMonth.slice(5, 7))}월</Text>
          <Pressable onPress={() => moveMonth(1)} hitSlop={10}><Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /></Pressable>
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
function DiagnosisCard({ diagnosis: d }: { diagnosis: CalendarDiagnosis }) {
  // capturedAt은 UTC ISO — Asia/Seoul(UTC+9) 기준 날짜로 변환해야 서버 집계(history/:date)와 일치한다.
  const capturedDate = new Date(new Date(d.capturedAt).getTime() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const openDetail = () =>
    router.push({ pathname: `/diagnosis/${d.id}`, params: { date: capturedDate } });

  return (
    <Pressable onPress={openDetail} style={({ pressed }) => [pressed && styles.diagCardPressed]}>
      <Card style={styles.diagCard}>
        <View style={styles.diagRow}>
          <MediaThumb diagnosis={d} />
          <View style={styles.diagInfo}>
            <Text style={styles.diagTime}>{formatTimeKo(d.capturedAt)} 촬영</Text>
            {statusLabel(d.status) && <Text style={styles.diagMeta}>{statusLabel(d.status)}</Text>}
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreBadgeValue}>{d.overallScore}</Text>
              <Text style={styles.scoreBadgeLabel}>점</Text>
            </View>
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

// 촬영 시각 “오후 3:40” 형식 (F39)
function formatTimeKo(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const hour = kst.getUTCHours();
  const minute = String(kst.getUTCMinutes()).padStart(2, '0');
  const period = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${h12}:${minute}`;
}

// 썸네일 — 이미지(가능 시) + 랜드마크 오버레이. 랜드마크만 있으면 점만 표시.
function MediaThumb({ diagnosis: d }: { diagnosis: CalendarDiagnosis }) {
  const img = d.image;
  const landmarks = d.landmarks;
  const expired = img ? new Date(img.expiresAt).getTime() <= Date.now() : false;

  if (!img && !landmarks) {
    return (
      <View style={styles.thumbBox}>
        <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} />
      </View>
    );
  }

  const overlay = landmarks ? (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      {landmarks.points.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={0.01} fill="rgba(107,181,164,0.9)" />
      ))}
    </Svg>
  ) : null;

  if (img && !expired) {
    return (
      <View style={styles.thumbBox}>
        <Image source={{ uri: img.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {overlay}
      </View>
    );
  }

  // 이미지 만료 or 이미지만 없고 랜드마크만 있는 경우 — 회색 배경에 점 표시
  return (
    <View style={styles.thumbBox}>
      <Ionicons name="scan-outline" size={20} color={colors.textTertiary} />
      {overlay}
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

  // 진단 카드 (F39 — 랜드마크 썸네일 + 요약 가로 카드)
  diagCard: { gap: spacing.md },
  diagCardPressed: { opacity: 0.85 },
  diagRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  thumbBox: {
    width: 96,
    minHeight: 120,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagInfo: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  diagTime: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  diagMeta: { ...typography.caption, color: colors.textTertiary },
  scoreBadge: {
    minWidth: 52,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.sageLight,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
  },
  scoreBadgeValue: { ...typography.headline, color: colors.sageDark },
  scoreBadgeLabel: { ...typography.caption, color: colors.sageDark },
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
