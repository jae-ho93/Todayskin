import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { EvidenceBadge } from '../../src/components/EvidenceBadge';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { gradeToColor } from '../../src/lib/skinGrade';
import { colors, radius, spacing, typography } from '../../src/theme';
import type {
  AirStatus,
  CalendarDiagnosis,
  CalendarWeather,
} from '../../src/types';

// 화면: 진단 상세 — 기록 탭의 랜드마크 카드에서 진입 (F39).
// 부위 분석·날씨·추천·제품 전체를 정돈된 레이아웃으로 표시한다.
export default function DiagnosisDetailScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const [diagnosis, setDiagnosis] = useState<CalendarDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const history = date ? await api.getHistoryByDate(date) : null;
      if (cancelled) return;
      const found = history?.diagnoses.find((d) => d.id === id) ?? null;
      setDiagnosis(found);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, date]);

  if (loading) {
    return (
      <ScreenContainer scroll={false} style={styles.centered}>
        <ActivityIndicator color={colors.sage} />
      </ScreenContainer>
    );
  }

  if (!diagnosis) {
    return (
      <ScreenContainer scroll={false} style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textTertiary} />
        <Text style={styles.unavailableTitle}>기록을 불러올 수 없어요</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeCta}>
          <Text style={styles.closeCtaText}>닫기</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  const d = diagnosis;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>진단 기록</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* 랜드마크 이미지 */}
      <MediaBlock diagnosis={d} />

      {/* 점수 요약 */}
      <Card style={styles.scoreCard}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreValue}>{d.overallScore}</Text>
            <Text style={styles.scoreLabel}>점</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.scoreTitle}>종합 피부 스코어</Text>
            {d.parts.length > 0 && (
              <Text style={styles.scoreMeta}>
                {d.parts.filter((p) => p.grade === '양호').length}/{d.parts.length} 부위가 양호해요
              </Text>
            )}
          </View>
        </View>
      </Card>

      {/* 날씨 — 촬영 당시 스냅샷 기준, 스코어 바로 아래 */}
      {d.weather && <WeatherCard weather={d.weather} capturedAt={d.capturedAt} />}

      {/* 부위 분석 2×3 그리드 */}
      {d.parts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>부위별 분석</Text>
          <View style={styles.partsGrid}>
            {d.parts.map((p) => {
              const color = gradeToColor(p.grade);
              return (
                <View key={p.part} style={styles.partCard}>
                  <Text style={styles.partLabel} numberOfLines={1}>{p.label}</Text>
                  <View style={[styles.partGradeBadge, { backgroundColor: color + '22' }]}>
                    <Text style={[styles.partGradeText, { color }]}>{p.grade}</Text>
                  </View>
                  <Text style={styles.partValue} numberOfLines={1}>
                    {p.moisture != null ? `수분 ${Math.round(p.moisture)}` : '수분 —'}
                  </Text>
                  <Text style={styles.partValue} numberOfLines={1}>
                    {p.elasticity != null ? `탄력 ${Math.round(p.elasticity)}` : '탄력 —'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* 추천 */}
      {d.recommendations.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>추천</Text>
          {d.recommendations.map((r) => (
            <Card key={r.id} style={styles.recCard}>
              <View style={styles.recHeader}>
                <EvidenceBadge grade={r.grade} />
                <Text style={styles.recTitle}>{r.title}</Text>
              </View>
              <Text style={styles.recExplanation} numberOfLines={3}>
                {r.explanation}
              </Text>
              {r.products.length > 0 && (
                <Pressable
                  onPress={() => router.push(`/recommendation/${r.id}`)}
                  style={({ pressed }) => [
                    styles.recProductsButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.recProductsButtonText}>
                    관련 제품 보기 ({r.products.length})
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.sageDark} />
                </Pressable>
              )}
            </Card>
          ))}
        </View>
      ) : (
        <Text style={styles.noRec}>이 진단에는 추천이 없어요</Text>
      )}
    </ScreenContainer>
  );
}

// ── 하위 컴포넌트 ──────────────────────────

function formatCapturedAt(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const hour = kst.getUTCHours();
  const minute = String(kst.getUTCMinutes()).padStart(2, '0');
  const period = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${year}년 ${month}월 ${day}일 ${period} ${h12}:${minute}`;
}

function WeatherCard({ weather: w, capturedAt }: { weather: CalendarWeather; capturedAt: string }) {
  const source = w.source === 'UNAVAILABLE' ? '측정 불가' : w.source;
  return (
    <Card style={styles.weatherCard}>
      <View style={styles.weatherHeader}>
        <Text style={styles.weatherRegion}>
          {[w.regionName, w.districtName].filter(Boolean).join(' ')}
        </Text>
        <View style={[styles.sourceBadge, w.source === 'LIVE' ? styles.sourceLive : styles.sourceCached]}>
          <Text style={styles.sourceText}>{source}</Text>
        </View>
      </View>
      <Text style={styles.weatherTime}>{formatCapturedAt(capturedAt)} 촬영</Text>
      <View style={styles.weatherMetrics}>
        <WeatherMetric label="자외선" value={w.uvIndex} status={w.uvStatus} />
        <WeatherMetric label="초미세먼지" value={w.pm25} status={w.pm25Status} />
        <WeatherMetric label="미세먼지" value={w.pm10} status={w.pm10Status} />
      </View>
    </Card>
  );
}

function WeatherMetric({
  label,
  value,
  status,
}: {
  label: string;
  value?: number | null;
  status?: AirStatus | null;
}) {
  const color = status === 'good' ? colors.sageDark : status === 'moderate' ? '#B5A03C' : status === 'bad' ? '#C0564E' : colors.textTertiary;
  return (
    <View style={styles.weatherMetric}>
      <Text style={styles.weatherMetricLabel}>{label}</Text>
      <Text style={[styles.weatherMetricValue, { color }]}>
        {value ?? '-'} {status ? `(${statusLabel2(status)})` : ''}
      </Text>
    </View>
  );
}

function statusLabel2(s: AirStatus): string {
  return s === 'good' ? '좋음' : s === 'moderate' ? '보통' : '나쁨';
}

// 이미지 + 랜드마크 오버레이 — 원본 비율 유지, 최대 높이 제한.
function MediaBlock({ diagnosis: d }: { diagnosis: CalendarDiagnosis }) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [imageRatio, setImageRatio] = useState<number | null>(null);

  const img = d.image;
  const landmarks = d.landmarks;
  const expired = img ? new Date(img.expiresAt).getTime() <= Date.now() : false;

  const overlay = landmarks ? (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      {landmarks.points.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={0.008} fill="rgba(107,181,164,0.9)" />
      ))}
    </Svg>
  ) : null;

  const ratio = imageRatio ?? (landmarks ? 1 : 4 / 3);
  const height = Math.min(320, Math.max(160, (boxWidth || 300) * ratio));

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

  return (
    <View
      style={[styles.imageBox, { height }]}
      onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}
    >
      {img && !expired ? (
        <Image
          source={{ uri: img.url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={(e) => {
            const { width, height: h } = e.nativeEvent.source;
            if (width > 0 && h > 0) setImageRatio(h / width);
          }}
        />
      ) : (
        <Ionicons name={expired ? 'time-outline' : 'scan-outline'} size={26} color={colors.textTertiary} />
      )}
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  unavailableTitle: { ...typography.body, color: colors.textTertiary },
  closeCta: {
    borderWidth: 1,
    borderColor: colors.sage,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  closeCtaText: { ...typography.bodySm, color: colors.sageDark, fontWeight: '700' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { ...typography.displaySm, color: colors.textPrimary },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scoreCard: { gap: spacing.sm },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scoreBadge: {
    minWidth: 64,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.sageLight,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
  },
  scoreValue: { ...typography.displaySm, color: colors.sageDark },
  scoreLabel: { ...typography.caption, color: colors.sageDark },
  scoreTitle: { ...typography.subtitle, color: colors.textPrimary },
  scoreMeta: { ...typography.caption, color: colors.textTertiary },

  section: { gap: spacing.sm },
  sectionTitle: { ...typography.headline, color: colors.textPrimary },
  partsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  partCard: {
    width: '31%',
    flexGrow: 1,
    minWidth: 90,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  partLabel: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
  partGradeBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, marginVertical: spacing.xs },
  partGradeText: { ...typography.bodySm, fontWeight: '700' },
  partValue: { ...typography.caption, color: colors.textSecondary },

  weatherCard: { gap: spacing.xs },
  weatherHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weatherTime: { ...typography.caption, color: colors.textTertiary },
  weatherRegion: { ...typography.subtitle, color: colors.textPrimary, flex: 1 },
  sourceBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  sourceLive: { backgroundColor: colors.sageLight },
  sourceCached: { backgroundColor: colors.gray100 },
  sourceText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  weatherMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weatherMetric: { flex: 1, minWidth: 90, gap: 2 },
  weatherMetricLabel: { ...typography.caption, color: colors.textTertiary },
  weatherMetricValue: { ...typography.bodySm, fontWeight: '700' },

  recCard: { gap: spacing.sm },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recTitle: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600', flex: 1 },
  recExplanation: { ...typography.caption, color: colors.textSecondary },
  recProductsButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.sage,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  recProductsButtonText: { ...typography.caption, color: colors.sageDark, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  noRec: { ...typography.caption, color: colors.textTertiary },

  imageBox: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
  },
  mediaNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  mediaNoticeText: { ...typography.caption, color: colors.textTertiary, flex: 1 },
});
