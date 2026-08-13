import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LandmarkOverlay } from '../../src/components/LandmarkOverlay';
import { api } from '../../src/api/client';
import { getLabReportEnabled } from '../../src/features/settings/lab';
import { Card } from '../../src/components/Card';
import { EvidenceBadge } from '../../src/components/EvidenceBadge';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useToast } from '../../src/components/Toast';
import {
  AIR_STATUS_LABEL,
  AIR_STATUS_TEXT_COLOR,
  UV_LEVEL_LABEL,
  UV_LEVEL_TEXT_COLOR,
} from '../../src/lib/air-status';
import { formatCapturedDate } from '../../src/lib/kst-date';
import { gradeToColor } from '../../src/lib/skinGrade';
import { colors, radius, spacing, typography } from '../../src/theme';
import type {
  AirStatus,
  CalendarDiagnosis,
  CalendarWeather,
  UvLevel,
} from '../../src/types';

// 화면: 진단 상세 — 기록 탭의 랜드마크 카드에서 진입 (F39).
// 부위 분석·날씨·추천·제품 전체를 정돈된 레이아웃으로 표시한다.
export default function DiagnosisDetailScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const [diagnosis, setDiagnosis] = useState<CalendarDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  // F79: AI 상세 리포트(여드름·질환)는 실험실 옵트인일 때만 노출 (기본 숨김, D-02)
  const [labEnabled, setLabEnabled] = useState(false);
  const { showToast } = useToast();

  /**
   * F67: 되돌릴 수 없는 삭제라 확인을 먼저 받는다. 사진이 함께 사라진다는 점을
   * 문구에 밝힌다 — 기록만 지워지고 사진은 남는다고 오해하면 동의의 의미가 없다.
   */
  const confirmDelete = () => {
    Alert.alert(
      '이 기록을 삭제할까요?',
      '촬영한 사진과 부위 분석, 이 기록에서 나온 추천이 함께 삭제됩니다. 삭제하면 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void handleDelete() },
      ],
    );
  };

  const handleDelete = async () => {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await api.deleteDiagnosis(id);
      showToast('기록을 삭제했어요', { type: 'success' });
      router.back();
    } catch {
      // 화면 상태는 그대로 두고 알린다 — 서버에 남아 있는데 화면에서만 지우면
      // 다음 진입에서 되살아난 것처럼 보인다.
      setDeleting(false);
      showToast('기록을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.', { type: 'error' });
    }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const [history, labReportEnabled] = await Promise.all([
        date ? api.getHistoryByDate(date) : Promise.resolve(null),
        getLabReportEnabled(),
      ]);
      if (cancelled) return;
      const found = history?.diagnoses.find((d) => d.id === id) ?? null;
      setDiagnosis(found);
      setLabEnabled(labReportEnabled);
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
        <Text style={styles.title}>측정 기록</Text>
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
      {d.weather ? (
        <WeatherCard weather={d.weather} capturedAt={d.capturedAt} />
      ) : (
        <Card style={styles.noWeatherCard}>
          <Ionicons
            name={d.wentOutside ? 'cloud-offline-outline' : 'home-outline'}
            size={18}
            color={colors.textTertiary}
          />
          <Text style={styles.noWeatherText}>
            {d.wentOutside
              ? '외출 시점의 날씨 정보를 가져오지 못했어요'
              : '외출하지 않아 날씨 기록이 없어요'}
          </Text>
        </Card>
      )}

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
                  {p.moisture != null && (
                    <Text style={styles.partValue} numberOfLines={1}>{`수분 ${Math.round(p.moisture)}`}</Text>
                  )}
                  {p.elasticity != null && (
                    <Text style={styles.partValue} numberOfLines={1}>{`탄력 ${Math.round(p.elasticity)}`}</Text>
                  )}
                  {p.moisture == null && p.elasticity == null && p.note && (
                    <Text style={styles.partValue} numberOfLines={1}>{p.note}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* 여드름/질환 분석 — 실험실 옵트인 시에만 (F79) */}
      {labEnabled && (d.diseaseClassification || d.acneReport) && (
        <View style={styles.section}>
          <View style={styles.reportBetaBadge}>
            <Text style={styles.reportBetaBadgeText}>베타 · 검증 중인 분석</Text>
          </View>
          <Text style={styles.reportNotice}>
            참고용 정보예요. 의학적 진단이 아니며, 설정 &gt; 실험실에서 끌 수 있어요.
          </Text>
          <Card style={styles.reportCard}>
            {d.diseaseClassification && (
              <View style={styles.reportSection}>
                <Text style={styles.sectionTitle}>피부 질환 분류</Text>
                <Text style={styles.partValue}>
                  {d.diseaseClassification.label} (확신도{' '}
                  {Math.round(d.diseaseClassification.confidence * 100)}%)
                </Text>
              </View>
            )}
            {d.acneReport && (
              <View style={styles.reportSection}>
                <Text style={styles.sectionTitle}>여드름 분석</Text>
                <Text style={styles.partValue}>{d.acneReport}</Text>
              </View>
            )}
          </Card>
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
        <Text style={styles.noRec}>이 기록에는 추천이 없어요</Text>
      )}

      {/* F67: 파괴적 동작이라 본문 아래 끝에 둔다 — 스크롤 중 오조작을 줄인다. */}
      <Pressable
        onPress={confirmDelete}
        disabled={deleting}
        style={({ pressed }) => [
          styles.deleteButton,
          pressed && styles.pressed,
          deleting && styles.deleteButtonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="이 기록 삭제"
      >
        {deleting ? (
          <ActivityIndicator size="small" color={colors.statusBad} />
        ) : (
          <Ionicons name="trash-outline" size={16} color={colors.statusBad} />
        )}
        <Text style={styles.deleteButtonText}>
          {deleting ? '삭제하는 중…' : '이 기록 삭제'}
        </Text>
      </Pressable>
    </ScreenContainer>
  );
}

// ── 하위 컴포넌트 ──────────────────────────

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
      <Text style={styles.weatherTime}>{formatCapturedDate(capturedAt)}</Text>
      {/* 마이 히스토리 카드와 같은 값(오늘 최고 기준)을 보여준다 — 카드/상세가 서로
          다른 숫자를 보여주면 안 되므로, 값이 없을 때만 그 시각 값으로 폴백한다. */}
      <View style={styles.weatherMetrics}>
        <WeatherMetric
          scale="uv"
          label="자외선"
          value={w.uvIndexPeak ?? w.uvIndex}
          status={w.uvStatusPeak ?? w.uvStatus}
          collectionFailed={w.uvCollectionFailed}
        />
        <WeatherMetric
          scale="air"
          label="초미세먼지"
          value={w.pm25Peak ?? w.pm25}
          status={w.pm25StatusPeak ?? w.pm25Status}
          collectionFailed={w.airCollectionFailed}
        />
        <WeatherMetric
          scale="air"
          label="미세먼지"
          value={w.pm10Peak ?? w.pm10}
          status={w.pm10StatusPeak ?? w.pm10Status}
          collectionFailed={w.airCollectionFailed}
        />
        <WeatherMetric
          scale="air"
          label="오존"
          value={w.ozonePeak ?? w.ozonePpm}
          status={w.ozoneStatusPeak ?? w.ozoneStatus}
          collectionFailed={w.airCollectionFailed}
        />
      </View>
      {/* N53: 기온·습도 — 과거 기록(마이그레이션 이전)은 값이 없으므로 있을 때만 */}
      {(typeof w.temperature === 'number' || typeof w.humidity === 'number') && (
        <Text style={styles.weatherNowcastLine}>
          {[
            typeof w.temperature === 'number' ? `기온 ${w.temperature}°C` : null,
            typeof w.humidity === 'number' ? `습도 ${w.humidity}%` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}
    </Card>
  );
}

// F64: 자외선은 낮음~위험, 대기질은 좋음~매우나쁨. 스케일을 판별 유니온으로 받아
// 지표에 맞지 않는 등급을 넘기면 컴파일이 실패하게 한다.
function WeatherMetric(
  props: {
    label: string;
    value?: number | null;
    /** N42/F70: 값이 없는 이유가 수집 실패인지. `-`와 구별해 보여준다. */
    collectionFailed?: boolean;
  } & (
    | { scale: 'air'; status?: AirStatus | null }
    | { scale: 'uv'; status?: UvLevel | null }
  ),
) {
  const { label, value, collectionFailed } = props;
  const isUv = props.scale === 'uv';
  const color = props.status
    ? isUv
      ? UV_LEVEL_TEXT_COLOR[props.status]
      : AIR_STATUS_TEXT_COLOR[props.status]
    : colors.textTertiary;
  const statusLabel = props.status
    ? isUv
      ? UV_LEVEL_LABEL[props.status]
      : AIR_STATUS_LABEL[props.status]
    : null;

  return (
    <View style={styles.weatherMetric}>
      <Text style={styles.weatherMetricLabel}>{label}</Text>
      <Text style={[styles.weatherMetricValue, { color }]}>
        {value ?? (collectionFailed ? '수집실패' : '-')}{' '}
        {statusLabel ? `(${statusLabel})` : ''}
      </Text>
    </View>
  );
}

// 이미지 + 랜드마크 오버레이 — 원본 비율 유지, 최대 높이 제한.
function MediaBlock({ diagnosis: d }: { diagnosis: CalendarDiagnosis }) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const img = d.image;
  const landmarks = d.landmarks;
  const expired = img ? new Date(img.expiresAt).getTime() <= Date.now() : false;

  const ratio = imageSize ? imageSize.height / imageSize.width : landmarks ? 1 : 4 / 3;
  const height = Math.min(320, Math.max(160, (boxWidth || 300) * ratio));

  // F65: 상세는 최대 320px이라 478점을 다 그려도 얼굴 윤곽이 읽힌다.
  const overlay = landmarks ? (
    <LandmarkOverlay
      points={landmarks.points}
      box={{ width: boxWidth, height }}
      imageSize={img && !expired ? imageSize : null}
      dotRadius={1.8}
      maxPoints={landmarks.points.length}
    />
  ) : null;

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
            // F65: 오버레이가 사진과 같은 cover 계산을 하려면 비율이 아니라
            // 원본 크기가 필요하다.
            if (width > 0 && h > 0) setImageSize({ width, height: h });
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

  reportBetaBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sageLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  reportBetaBadgeText: { ...typography.caption, color: colors.sage, fontWeight: '700' },
  reportNotice: { ...typography.caption, color: colors.textTertiary },
  reportCard: { gap: spacing.md },
  reportSection: { gap: spacing.xs },

  noWeatherCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noWeatherText: { ...typography.bodySm, color: colors.textTertiary, flex: 1 },

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
  // N53: 기온·습도 요약 라인
  weatherNowcastLine: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
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

  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.statusBad + '55',
  },
  deleteButtonDisabled: { opacity: 0.5 },
  deleteButtonText: { ...typography.bodySm, color: colors.statusBad },

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
