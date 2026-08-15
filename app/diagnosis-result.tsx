import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { api } from '../src/api/client';
import { EvidenceBadge } from '../src/components/EvidenceBadge';
import { FACE_PART_PIN_POSITION, FaceIllustration } from '../src/components/FaceIllustration';
import { getLabReportEnabled } from '../src/features/settings/lab';
import { useAsyncJob, unwrapJobItems } from '../src/hooks/useAsyncJob';
import { resolveScoreContext } from '../src/lib/score-context';
import { getSession } from '../src/lib/session';
import { gradeToColor } from '../src/lib/skinGrade';
import { colors, MAX_FONT_SCALE, radius, shadow, spacing, typography } from '../src/theme';
import type {
  Gender,
  Recommendation,
  RecommendationTiming,
  ScoreSeries,
  SkinPartMetric,
  SkinScoreSnapshot,
} from '../src/types';

// 종합 점수 → 등급 라벨 (백엔드 부위 등급 4단계와 별개인 화면용 단순 구간).
function overallGrade(score: number): string {
  if (score >= 90) return '우수';
  if (score >= 80) return '양호';
  if (score >= 70) return '보통';
  return '관리 필요';
}

function clampBar(value: number): number {
  return Math.min(100, Math.max(0, value));
}

// 6자리 hex를 흰색과 섞어 연한 톤을 만든다 (그라데이션 stop용).
function tint(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((num >> 16) & 0xff)}, ${mix((num >> 8) & 0xff)}, ${mix(num & 0xff)})`;
}

// 추천 타이밍 칩 (외출 후 / 자기 전 / 언제든)
const TIMING_META: Record<RecommendationTiming, { icon: keyof typeof Ionicons.glyphMap; bg: string; text: string }> = {
  '외출 후': { icon: 'sunny-outline', bg: colors.sageLight, text: colors.sageDark },
  '자기 전': { icon: 'moon-outline', bg: colors.coralLight, text: colors.coralDark },
  언제든: { icon: 'time-outline', bg: colors.gray100, text: colors.textSecondary },
};

function TimingChip({ timing }: { timing: RecommendationTiming }) {
  const meta = TIMING_META[timing];
  return (
    <View style={[styles.timingChip, { backgroundColor: meta.bg }]}>
      <Ionicons name={meta.icon} size={12} color={meta.text} />
      <Text style={[styles.timingChipText, { color: meta.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {timing}
      </Text>
    </View>
  );
}

// 히어로 — 그라데이션 스코어 링 (F85: 평면 숫자 카드를 링 게이지로 교체)
function ScoreRing({ score, color, grade }: { score: number; color: string; grade: string }) {
  const size = 176;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="scoreRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={color} />
            <Stop offset="100%" stopColor={tint(color, 0.5)} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.gray100}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#scoreRingGradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <View style={styles.ringScoreRow}>
          <Text style={styles.ringScore} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {Math.round(clamped)}
          </Text>
          <Text style={styles.ringUnit} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            점
          </Text>
        </View>
        <Text style={[styles.ringGrade, { color }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {grade}
        </Text>
      </View>
    </View>
  );
}

// 얼굴 일러스트 + 부위 핀 (스와이프/단일 공용 패널)
function FacePanel({
  gender,
  parts,
  onSelectPart,
}: {
  gender?: Gender;
  parts: SkinPartMetric[];
  onSelectPart: (p: SkinPartMetric) => void;
}) {
  return (
    <View style={styles.faceWrap}>
      <FaceIllustration gender={gender} />
      {parts.map((p) => {
        const pos = FACE_PART_PIN_POSITION[p.part];
        if (!pos) return null;
        const color = gradeToColor(p.grade);
        return (
          <Pressable
            key={p.part}
            onPress={() => onSelectPart(p)}
            hitSlop={10}
            style={({ pressed }) => [
              styles.pin,
              { left: `${pos.xPct}%`, top: `${pos.yPct}%`, backgroundColor: color },
              pressed && styles.pinPressed,
            ]}
          />
        );
      })}
    </View>
  );
}

// 화면 4: 진단 결과 — 얼굴 일러스트 핀 + 종합 점수 카드 + 오늘의 추천 (F33/F85 리디자인)
export default function DiagnosisResultScreen() {
  const [skinScore, setSkinScore] = useState<SkinScoreSnapshot | null>(null);
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [selectedPart, setSelectedPart] = useState<SkinPartMetric | null>(null);
  const [series, setSeries] = useState<ScoreSeries | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  // 얼굴 일러스트 ↔ 여드름/질환 분석 리포트 스와이프 페이지 상태.
  const [pageWidth, setPageWidth] = useState(0);
  const [activePage, setActivePage] = useState(0);
  // F79: AI 상세 리포트(여드름·질환)는 실험실 옵트인일 때만 노출 (기본 숨김, D-02)
  const [labEnabled, setLabEnabled] = useState(false);

  // 홈 대시보드가 "가장 최근 진단"에만 기회주의적으로 추천을 생성해서, 홈을 들르지
  // 않고 바로 기록을 보면 "추천이 없어요"로 보이는 문제가 있었다. 이 화면(촬영 직후
  // 결과)에서 직접 생성을 트리거해 모든 진단이 예외 없이 추천을 갖게 한다.
  const { watch } = useAsyncJob<Recommendation>(unwrapJobItems('recommendations'));

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getSkinScore(),
      getSession(),
      // F81: 월 경계(1일 측정 등)에서도 직전 측정·첫 측정 여부를 알 수 있게
      // 이번 달이 아니라 서버 기본(최근 90일) 시리즈를 쓴다.
      api.getScoreSeries(),
      getLabReportEnabled(),
    ]).then(async ([result, session, scoreSeries, labReportEnabled]) => {
      if (cancelled) return;
      if (result.status === 'ok') setSkinScore(result.data);
      setGender(session?.gender);
      setSeries(scoreSeries);
      setLabEnabled(labReportEnabled);
      setLoading(false);

      if (result.status !== 'ok') return;
      const [aGradeResult, fastResponse] = await Promise.all([
        api.getRecommendations('A'),
        api.generateRecommendationsFast(result.data.id),
      ]);
      if (cancelled) return;
      const aGrade = aGradeResult.status === 'ok' ? aGradeResult.data : [];
      const bGrade = fastResponse?.recommendations ?? [];
      setRecommendations([...aGrade, ...bGrade]);
      watch(fastResponse, (live) => {
        if (cancelled) return;
        setRecommendations([...aGrade, ...live]);
      });
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // watch는 useAsyncJob 내부에서 빈 deps useCallback으로 고정된 참조라
    // 매 렌더 재실행을 유발하지 않는다 — 여기 나열은 exhaustive-deps 충족용.
  }, [watch]);

  // F81: 직전 진단 대비 변화 배지 + "첫 측정" 여부(기준점 안내용)를 한 번에 계산.
  const scoreContext = useMemo(
    () =>
      resolveScoreContext(series?.points, skinScore?.id ?? '', skinScore?.overallScore ?? 0),
    [series, skinScore],
  );
  const change = scoreContext.change;

  if (loading) {
    return (
      <View style={[styles.flex, styles.centered]}>
        <ActivityIndicator color={colors.sage} />
      </View>
    );
  }

  if (!skinScore) {
    return (
      <View style={[styles.flex, styles.centered]}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textTertiary} />
        <Text style={styles.unavailableTitle}>측정 결과를 불러올 수 없어요</Text>
        <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12} style={styles.unavailableCta}>
          <Text style={styles.unavailableCtaText}>홈으로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const grade = overallGrade(skinScore.overallScore);
  const gradeColor = gradeToColor(grade);
  const hasExtraReport = labEnabled && Boolean(skinScore.acneReport || skinScore.diseaseClassification);

  // 변화 배지 색 — 상승은 세이지, 하락은 코랄, 동일/없음은 그레이.
  const changeMeta = change
    ? change.up === null
      ? { bg: colors.gray100, text: colors.textSecondary }
      : change.up
        ? { bg: colors.sageLight, text: colors.sageDark }
        : { bg: colors.coralLight, text: colors.coralDark }
    : null;

  function onFacePageLayout(e: LayoutChangeEvent) {
    setPageWidth(e.nativeEvent.layout.width);
  }

  function onFacePageScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!pageWidth) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    setActivePage(page);
  }

  const faceHintText = '표시를 눌러 부위별 상세 정보를 확인하세요';

  return (
    <View style={styles.flex}>
      <SafeAreaView style={styles.header}>
        <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>오늘의 측정 결과</Text>
        <View style={{ width: 22 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* 히어로 — 종합 점수 링 + 등급 + 변화 배지 */}
        <View style={[styles.heroCard, { backgroundColor: `${gradeColor}0D` }]}>
          <View style={[styles.heroAccent, { backgroundColor: gradeColor }]} />
          <Text style={styles.heroLabel}>오늘의 종합 점수</Text>
          <ScoreRing score={skinScore.overallScore} color={gradeColor} grade={grade} />
          {changeMeta && change && (
            <View style={[styles.changePill, { backgroundColor: changeMeta.bg }]}>
              <Ionicons
                name={change.up === null ? 'remove' : change.up ? 'trending-up' : 'trending-down'}
                size={13}
                color={changeMeta.text}
              />
              <Text style={[styles.changePillText, { color: changeMeta.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {change.label}
              </Text>
            </View>
          )}
          <Text style={styles.heroCaption}>어제의 나와 비교한 오늘의 피부 상태예요</Text>
        </View>

        {/* F81: 첫 측정 기준점 안내 — "이 점수가 무엇 기준인지"에 대한 답 */}
        {scoreContext.isFirstMeasurement && (
          <View style={styles.baselineCard}>
            <Ionicons name="flag-outline" size={18} color={colors.sageDark} />
            <Text style={styles.baselineText}>
              첫 측정이 끝났어요. 이 점수는 좋고 나쁨의 판정이 아니라{' '}
              <Text style={styles.baselineBold}>나와 비교할 시작점</Text>이에요. 매일
              기록할수록 어제의 나와의 비교가 정확해져요.
            </Text>
          </View>
        )}

        {hasExtraReport ? (
          <View onLayout={onFacePageLayout}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onFacePageScrollEnd}
            >
              <View style={[styles.facePage, { width: pageWidth || undefined }]}>
                <View style={styles.faceCard}>
                  <FacePanel gender={gender} parts={skinScore.parts} onSelectPart={setSelectedPart} />
                  <Text style={styles.faceHint}>{faceHintText}</Text>
                </View>
              </View>

              <View style={[styles.facePage, { width: pageWidth || undefined }]}>
                <View style={styles.reportCard}>
                  <View style={styles.reportBetaBadge}>
                    <Text style={styles.reportBetaBadgeText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      베타 · 검증 중인 분석
                    </Text>
                  </View>
                  <Text style={styles.reportNotice}>
                    참고용 정보예요. 의학적 진단이 아니며, 설정 &gt; 실험실에서 끌 수 있어요.
                  </Text>
                  {skinScore.diseaseClassification && (
                    <View style={styles.reportSection}>
                      <Text style={styles.reportSectionTitle}>피부 질환 분류</Text>
                      <Text style={styles.reportSectionBody}>
                        {skinScore.diseaseClassification.label} (확신도{' '}
                        {Math.round(skinScore.diseaseClassification.confidence * 100)}%)
                      </Text>
                    </View>
                  )}
                  {skinScore.acneReport && (
                    <View style={styles.reportSection}>
                      <Text style={styles.reportSectionTitle}>여드름 분석</Text>
                      <Text style={styles.reportSectionBody}>{skinScore.acneReport}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.faceHint}>← 옆으로 밀어 얼굴 보기로 돌아가기</Text>
              </View>
            </ScrollView>
            <View style={styles.pageDots}>
              <View style={[styles.pageDot, activePage === 0 && styles.pageDotActive]} />
              <View style={[styles.pageDot, activePage === 1 && styles.pageDotActive]} />
            </View>
          </View>
        ) : (
          <View style={styles.faceCard}>
            <FacePanel gender={gender} parts={skinScore.parts} onSelectPart={setSelectedPart} />
            <Text style={styles.faceHint}>{faceHintText}</Text>
          </View>
        )}

        {/* 오늘의 추천 (F33/F85) — 기록에 있던 추천을 결과에서 바로 보여준다 */}
        {recommendations.length > 0 && (
          <View style={styles.recSection}>
            <Text style={styles.sectionTitle}>오늘의 추천</Text>
            <Text style={styles.sectionCaption}>오늘의 피부 상태와 날씨를 고려한 추천이에요</Text>
            {recommendations.slice(0, 2).map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/recommendation/${r.id}`)}
                style={({ pressed }) => [styles.recCard, pressed && styles.recCardPressed]}
              >
                <View style={styles.recBadgeCol}>
                  <EvidenceBadge grade={r.grade} />
                  {r.timing ? <TimingChip timing={r.timing} /> : null}
                </View>
                <View style={styles.recTextWrap}>
                  <Text style={styles.recTitle} numberOfLines={2}>{r.title}</Text>
                  <Text style={styles.recExplanation} numberOfLines={2}>{r.explanation}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        )}

        {/* F81: 조명·각도가 이상했다면 바로 다시 잴 수 있는 보조 동선 */}
        <Pressable
          onPress={() => router.replace('/camera-guide')}
          hitSlop={8}
          style={({ pressed }) => [styles.retakeCta, pressed && styles.retakeCtaPressed]}
        >
          <Ionicons name="camera-outline" size={16} color={colors.sageDark} />
          <Text style={styles.retakeCtaText}>다시 측정하기</Text>
        </Pressable>
        <Text style={styles.savedHint}>결과는 기록 탭에서 언제든 다시 볼 수 있어요</Text>
        <Text style={styles.disclaimer}>측정·추정값입니다. 의학적 진단이 아닙니다.</Text>
      </ScrollView>

      {/* 부위 상세 — 바텀시트 */}
      <Modal
        visible={selectedPart !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPart(null)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setSelectedPart(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {selectedPart && (
              <>
                <View style={styles.sheetGrabber} />
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetHeaderLeft}>
                    <View style={[styles.sheetDot, { backgroundColor: gradeToColor(selectedPart.grade) }]} />
                    <Text style={styles.sheetTitle}>{selectedPart.label}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedPart(null)} hitSlop={12}>
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <View
                  style={[
                    styles.sheetGradeBadge,
                    { backgroundColor: gradeToColor(selectedPart.grade) + '22' },
                  ]}
                >
                  <Text
                    style={[styles.sheetGradeText, { color: gradeToColor(selectedPart.grade) }]}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                  >
                    {selectedPart.grade}
                  </Text>
                </View>
                {selectedPart.note && <Text style={styles.sheetNote}>{selectedPart.note}</Text>}
                {(typeof selectedPart.moisture === 'number' ||
                  typeof selectedPart.elasticity === 'number') && (
                  <View style={styles.sheetMetrics}>
                    {typeof selectedPart.moisture === 'number' && (
                      <View style={styles.sheetMetricCard}>
                        <Text style={styles.sheetMetricLabel}>수분</Text>
                        <Text style={styles.sheetMetricValue} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                          {selectedPart.moisture}
                        </Text>
                        <View style={styles.sheetMetricTrack}>
                          <View
                            style={[
                              styles.sheetMetricFill,
                              {
                                width: `${clampBar(selectedPart.moisture)}%`,
                                backgroundColor: gradeToColor(selectedPart.grade),
                              },
                            ]}
                          />
                        </View>
                      </View>
                    )}
                    {typeof selectedPart.elasticity === 'number' && (
                      <View style={styles.sheetMetricCard}>
                        <Text style={styles.sheetMetricLabel}>탄력</Text>
                        <Text style={styles.sheetMetricValue} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                          {selectedPart.elasticity}
                        </Text>
                        <View style={styles.sheetMetricTrack}>
                          <View
                            style={[
                              styles.sheetMetricFill,
                              {
                                width: `${clampBar(selectedPart.elasticity)}%`,
                                backgroundColor: gradeToColor(selectedPart.grade),
                              },
                            ]}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const PIN_SIZE = 20;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  unavailableTitle: { ...typography.headline, color: colors.textPrimary },
  unavailableCta: {
    marginTop: spacing.sm,
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  unavailableCtaText: { ...typography.subtitle, color: colors.textInverse },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: { ...typography.subtitle, color: colors.textPrimary },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },

  // 히어로 — 종합 점수 링
  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  heroAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    opacity: 0.6,
  },
  heroLabel: { ...typography.bodySm, color: colors.textSecondary },
  ringWrap: { alignItems: 'center', justifyContent: 'center', marginVertical: spacing.sm },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringScoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  ringScore: {
    ...typography.displayLg,
    fontSize: 46,
    lineHeight: 54,
    color: colors.textPrimary,
  },
  ringUnit: { ...typography.subtitle, color: colors.textSecondary },
  ringGrade: { ...typography.headline, marginTop: 2 },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  changePillText: { ...typography.bodySm, fontWeight: '700' },
  heroCaption: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },

  // F81: 첫 측정 기준점 안내
  baselineCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.sageLight,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  baselineText: { ...typography.bodySm, color: colors.textPrimary, flex: 1 },
  baselineBold: { fontWeight: '700', color: colors.sageDark },

  // 얼굴 카드 + 부위 핀
  faceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  faceWrap: {
    width: '100%',
    aspectRatio: 150 / 200,
  },
  pin: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    marginLeft: -PIN_SIZE / 2,
    marginTop: -PIN_SIZE / 2,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.surface,
    ...shadow.card,
  },
  pinPressed: { transform: [{ scale: 1.25 }] },
  faceHint: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // 얼굴 일러스트 ↔ 여드름/질환 리포트 스와이프 페이지
  facePage: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.xs },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gray200 },
  pageDotActive: { backgroundColor: colors.sage },
  reportCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  reportBetaBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sage + '22',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  reportBetaBadgeText: { ...typography.caption, color: colors.sage, fontWeight: '700' },
  reportNotice: { ...typography.caption, color: colors.textTertiary },
  reportSection: { gap: spacing.xs },
  reportSectionTitle: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
  reportSectionBody: { ...typography.body, color: colors.textPrimary },

  // 오늘의 추천
  recSection: { gap: spacing.sm },
  sectionTitle: { ...typography.headline, color: colors.textPrimary },
  sectionCaption: { ...typography.caption, color: colors.textTertiary, marginTop: -spacing.xs },
  recCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  recCardPressed: { opacity: 0.75 },
  recBadgeCol: { gap: spacing.xs, alignItems: 'flex-start' },
  recTextWrap: { flex: 1, gap: 2 },
  recTitle: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
  recExplanation: { ...typography.caption, color: colors.textSecondary },
  timingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  timingChipText: { ...typography.caption, fontWeight: '700' },

  // F81: 재측정 보조 CTA
  retakeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.sage,
    marginTop: spacing.sm,
  },
  retakeCtaPressed: { backgroundColor: colors.sageLight },
  retakeCtaText: { ...typography.subtitle, color: colors.sageDark },

  savedHint: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm },
  disclaimer: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },

  // 부위 상세 바텀시트
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(29, 28, 25, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray200,
    marginBottom: spacing.xs,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetDot: { width: 12, height: 12, borderRadius: 6 },
  sheetTitle: { ...typography.headline, color: colors.textPrimary },
  sheetGradeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  sheetGradeText: { ...typography.bodySm, fontWeight: '700' },
  sheetNote: { ...typography.body, color: colors.textSecondary },
  sheetMetrics: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  sheetMetricCard: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sheetMetricLabel: { ...typography.caption, color: colors.textTertiary },
  sheetMetricValue: { ...typography.displaySm, color: colors.textPrimary },
  sheetMetricTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gray200,
    overflow: 'hidden',
  },
  sheetMetricFill: { height: '100%', borderRadius: 4 },
});
