import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { EvidenceBadge } from '../../src/components/EvidenceBadge';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors, radius, spacing, typography } from '../../src/theme';
import type {
  AirStatus,
  CalendarDayHistory,
  CalendarDiagnosis,
  CalendarWeather,
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

function formatShortDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}.${Number(d)}`;
}

function weekday(date: string): string {
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(`${date}T12:00:00+09:00`).getDay()];
}

function formatTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

const AIR_LABEL: Record<AirStatus, string> = { good: '좋음', moderate: '보통', bad: '나쁨' };

function airLabel(s?: AirStatus | null): string {
  return s ? AIR_LABEL[s] : '측정 불가';
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
  const dates = useMemo(() => kstDateStrings(14), []);

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
    setScoreSeries(await api.getScoreSeries());
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    void load();
    // 기본으로 오늘 날짜를 선택해 바로 내용이 보이게 한다.
    selectDay(dates[0]);
    return () => {
      cancelled = true;
      dayRequestSeq.current += 1; // 언마운트 후 도착하는 응답도 폐기
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            {trend.from} ~ {trend.to}
          </Text>
        </Card>
      )}

      <Text style={styles.sectionTitle}>날짜별 기록</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateStrip}
      >
        {dates.map((date) => {
          const active = date === selectedDate;
          return (
            <Pressable
              key={date}
              onPress={() => selectDay(date)}
              style={[styles.dateChip, active && styles.dateChipActive]}
            >
              <Text style={[styles.dateWeekday, active && styles.dateTextActive]}>
                {weekday(date)}
              </Text>
              <Text style={[styles.dateNum, active && styles.dateTextActive]}>
                {formatShortDate(date)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

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

function DiagnosisCard({ diagnosis: d }: { diagnosis: CalendarDiagnosis }) {
  return (
    <Card style={styles.diagCard}>
      <View style={styles.diagHeader}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.diagTime}>{formatTime(d.capturedAt)} 촬영</Text>
          {statusLabel(d.status) && <Text style={styles.diagMeta}>{statusLabel(d.status)}</Text>}
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreBadgeValue}>{d.overallScore}</Text>
          <Text style={styles.scoreBadgeLabel}>점</Text>
        </View>
      </View>

      {d.weather && <WeatherSummary weather={d.weather} />}

      {d.parts.length > 0 && (
        <View style={styles.partsBlock}>
          {d.parts.map((p) => (
            <View key={p.part} style={styles.partRow}>
              <Text style={styles.partLabel} numberOfLines={1}>{p.label}</Text>
              <Text style={styles.partGrade} numberOfLines={1}>{p.grade}</Text>
              <Text style={styles.partValue} numberOfLines={1} ellipsizeMode="tail">
                {p.moisture != null ? `수분 ${p.moisture}` : ''}
                {p.moisture != null && p.elasticity != null ? ' · ' : ''}
                {p.elasticity != null ? `탄력 ${p.elasticity}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {d.recommendations.length > 0 ? (
        <View style={styles.recsBlock}>
          {d.recommendations.map((r) => (
            <View key={r.id} style={styles.recBlock}>
              <View style={styles.recHeader}>
                <EvidenceBadge grade={r.grade} />
                <Text style={styles.recTitle}>{r.title}</Text>
              </View>
              <Text style={styles.recExplanation}>{r.explanation}</Text>
              {r.products.length > 0 && (
                <Text style={styles.recProducts}>
                  관련 제품: {r.products.map((p) => `${p.brand} ${p.name}`).join(', ')}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noRec}>이 진단에는 추천이 없어요</Text>
      )}

      <MediaBlock diagnosis={d} />
    </Card>
  );
}

function WeatherSummary({ weather: w }: { weather: CalendarWeather }) {
  const source = w.source === 'UNAVAILABLE' ? '측정 불가' : w.source;
  return (
    <View style={styles.weatherBlock}>
      <Text style={styles.weatherRegion}>
        {w.regionName} · {source}
      </Text>
      <View style={styles.weatherMetrics}>
        <Text style={styles.weatherMetric}>자외선 {w.uvIndex ?? '-'} ({airLabel(w.uvStatus)})</Text>
        <Text style={styles.weatherMetric}>초미세먼지 {w.pm25 ?? '-'}</Text>
        <Text style={styles.weatherMetric}>미세먼지 {w.pm10 ?? '-'}</Text>
      </View>
    </View>
  );
}

// 이미지와 랜드마크 오버레이를 같은 영역에 겹쳐 렌더링한다.
// 이미지를 cover 크롭하면 랜드마크 좌표(정규화 0~1)가 잘린 영역과 어긋나므로,
// 원본 비율을 그대로 유지한 채 표시 크기를 계산해 그 안에 이미지+SVG를 겹친다.
function MediaBlock({ diagnosis: d }: { diagnosis: CalendarDiagnosis }) {
  const img = d.image;
  const landmarks = d.landmarks;
  // 이미지 컨테이너의 실제 너비(onLayout)와 원본 세로/가로 비율(onLoad)로 표시 크기를 구한다.
  const [boxWidth, setBoxWidth] = useState(0);
  const [imageRatio, setImageRatio] = useState<number | null>(null); // height / width

  if (!img && !landmarks) {
    return (
      <View style={styles.mediaNotice}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.textTertiary} />
        <Text style={styles.mediaNoticeText}>
          사진 저장 동의를 하지 않아 이미지·랜드마크는 표시되지 않아요
        </Text>
      </View>
    );
  }

  const expired = img ? new Date(img.expiresAt).getTime() <= Date.now() : false;

  // 비율 유지 + 최대 높이 240px로 클램프. 축소는 비율이 유지되므로 랜드마크 정렬이 흐트러지지 않는다.
  const displaySize = useMemo(() => {
    if (!boxWidth || !imageRatio) return null;
    const MAX_HEIGHT = 240;
    let width = boxWidth;
    let height = boxWidth * imageRatio;
    if (height > MAX_HEIGHT) {
      height = MAX_HEIGHT;
      width = MAX_HEIGHT / imageRatio;
    }
    return { width, height };
  }, [boxWidth, imageRatio]);

  return (
    <View style={styles.mediaBlock}>
     {landmarks ? (
  <View style={styles.mediaBlock}>
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
  </View>
) : img ? (
  <View style={styles.mediaBlock}>
    <View
      style={styles.imageBox}
      onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}
    >
      {displaySize ? (
        <View style={{ width: displaySize.width, height: displaySize.height }}>
          <Image
            source={{ uri: img.url }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            onLoad={(e) => {
              const { width, height } = e.nativeEvent.source;
              if (width > 0 && height > 0) setImageRatio(height / width);
            }}
          />
        </View>
      ) : (
        <ActivityIndicator color={colors.sage} />
      )}
    </View>
  </View>
) : (
  <Text style={styles.noRec}>0| 진단에는 추천이 없어요</Text>
)}
      ) : (
        <View style={styles.mediaNotice}>
          <Ionicons name="image-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.mediaNoticeText}>보관 이미지가 없어요</Text>
        </View>
      )
      {landmarks && (
        <Text style={styles.landmarkCaption}>
          얼굴 랜드마크 {landmarks.points.length}점 · {landmarks.version}
        </Text>
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
  dateStrip: { gap: spacing.sm, paddingRight: spacing.lg },
  dateChip: {
    minWidth: 52,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  dateChipActive: { backgroundColor: colors.sage, borderColor: colors.sage },
  dateWeekday: { ...typography.caption, color: colors.textTertiary },
  dateNum: { ...typography.subtitle, color: colors.textPrimary },
  dateTextActive: { color: colors.textInverse },
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

  // 진단 카드
  diagCard: { gap: spacing.md },
  diagHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  weatherBlock: {
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  weatherRegion: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  weatherMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weatherMetric: { ...typography.caption, color: colors.textSecondary },
  partsBlock: { gap: spacing.xs },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  partLabel: { ...typography.bodySm, color: colors.textPrimary, flexShrink: 1 },
  partGrade: { ...typography.bodySm, color: colors.sageDark, fontWeight: '600', flexShrink: 0 },
  partValue: { ...typography.caption, color: colors.textTertiary, flex: 1 },
  recsBlock: { gap: spacing.sm },
  recBlock: {
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recTitle: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600', flex: 1 },
  recExplanation: { ...typography.caption, color: colors.textSecondary },
  recProducts: { ...typography.caption, color: colors.sageDark },
  noRec: { ...typography.caption, color: colors.textTertiary },

  // 이미지 / 랜드마크
  mediaBlock: { gap: spacing.xs },
  mediaNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  mediaNoticeText: { ...typography.caption, color: colors.textTertiary, flex: 1 },
  imageBox: {
    minHeight: 120,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageExpiredText: { ...typography.caption, color: colors.textTertiary },
  landmarkCaption: { ...typography.caption, color: colors.sageDark },
});
