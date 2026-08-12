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
import { api } from '../src/api/client';
import { EvidenceBadge } from '../src/components/EvidenceBadge';
import { FACE_PART_PIN_POSITION, FaceIllustration } from '../src/components/FaceIllustration';
import { getSession } from '../src/lib/session';
import { gradeToColor } from '../src/lib/skinGrade';
import { colors, radius, shadow, spacing, typography } from '../src/theme';
import type {
  CalendarRecommendation,
  Gender,
  ScoreSeries,
  SkinPartMetric,
  SkinScoreSnapshot,
} from '../src/types';

// KST(UTC+9) 기준 오늘 날짜 문자열.
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 이번 달 범위 (스코어 추이 비교용).
function currentMonthRange(): { from: string; to: string } {
  const today = todayKst();
  const [year, month] = today.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}

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

// 화면 4: 진단 결과 — 얼굴 일러스트 핀 + 종합 점수 카드 + 오늘의 추천 (F33 리디자인)
export default function DiagnosisResultScreen() {
  const [skinScore, setSkinScore] = useState<SkinScoreSnapshot | null>(null);
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [selectedPart, setSelectedPart] = useState<SkinPartMetric | null>(null);
  const [series, setSeries] = useState<ScoreSeries | null>(null);
  const [recommendations, setRecommendations] = useState<CalendarRecommendation[]>([]);
  // 얼굴 일러스트 ↔ 여드름/질환 분석 리포트 스와이프 페이지 상태.
  const [pageWidth, setPageWidth] = useState(0);
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getSkinScore(),
      getSession(),
      api.getScoreSeries(currentMonthRange()),
      api.getHistoryByDate(todayKst()),
    ]).then(([result, session, scoreSeries, history]) => {
      if (cancelled) return;
      if (result.status === 'ok') setSkinScore(result.data);
      setGender(session?.gender);
      setSeries(scoreSeries);
      // 기록(히스토리)은 촬영 시각 최신순 — 첫 진단이 방금 촬영분의 추천을 담고 있다.
      setRecommendations(history?.diagnoses?.[0]?.recommendations ?? []);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 직전 진단 대비 종합점수 변화 배지.
  const change = useMemo(() => {
    if (!skinScore || !series) return null;
    const points = series.points;
    const idx = points.findIndex((p) => p.diagnosisId === skinScore.id);
    if (idx <= 0) return null;
    const prev = points[idx - 1];
    if (!prev) return null;
    const diff = Math.round(skinScore.overallScore - prev.overallScore);
    if (diff === 0) return { label: '지난 진단과 동일', up: null as boolean | null };
    return { label: `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}점`, up: diff > 0 };
  }, [skinScore, series]);

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
        <Text style={styles.unavailableTitle}>진단 결과를 불러올 수 없어요</Text>
        <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12} style={styles.unavailableCta}>
          <Text style={styles.unavailableCtaText}>홈으로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const grade = overallGrade(skinScore.overallScore);
  const gradeColor = gradeToColor(grade);
  const hasExtraReport = Boolean(skinScore.acneReport || skinScore.diseaseClassification);

  function onFacePageLayout(e: LayoutChangeEvent) {
    setPageWidth(e.nativeEvent.layout.width);
  }

  function onFacePageScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!pageWidth) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    setActivePage(page);
  }

  return (
    <View style={styles.flex}>
      <SafeAreaView style={styles.header}>
        <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>오늘의 진단 결과</Text>
        <View style={{ width: 22 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* 종합 점수 카드 */}
        <View style={styles.summaryCard}>
          <Text style={styles.overallLabel}>종합 점수</Text>
          <View style={styles.summaryScoreRow}>
            <Text style={styles.overallScore}>{skinScore.overallScore}</Text>
            <View style={[styles.gradePill, { backgroundColor: gradeColor + '22' }]}>
              <Text style={[styles.gradePillText, { color: gradeColor }]}>{grade}</Text>
            </View>
          </View>
          {change && (
            <View style={styles.changeRow}>
              <Ionicons
                name={change.up === null ? 'remove' : change.up ? 'trending-up' : 'trending-down'}
                size={14}
                color={change.up === null ? colors.textTertiary : change.up ? colors.statusGood : colors.coralDark}
              />
              <Text style={[styles.changeText, { color: change.up === null ? colors.textTertiary : change.up ? colors.statusGood : colors.coralDark }]}>
                {change.label}
              </Text>
            </View>
          )}
        </View>

        {hasExtraReport ? (
          <View onLayout={onFacePageLayout}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onFacePageScrollEnd}
            >
              <View style={[styles.facePage, { width: pageWidth || undefined }]}>
                <View style={styles.faceWrap}>
                  <FaceIllustration gender={gender} />
                  {skinScore.parts.map((p) => {
                    const pos = FACE_PART_PIN_POSITION[p.part];
                    if (!pos) return null;
                    const color = gradeToColor(p.grade);
                    return (
                      <Pressable
                        key={p.part}
                        onPress={() => setSelectedPart(p)}
                        hitSlop={10}
                        style={[
                          styles.pin,
                          { left: `${pos.xPct}%`, top: `${pos.yPct}%`, backgroundColor: color },
                        ]}
                      />
                    );
                  })}
                </View>
                <Text style={styles.faceHint}>표시를 눌러 부위별 상세 정보를 확인하세요</Text>
              </View>

              <View style={[styles.facePage, { width: pageWidth || undefined }]}>
                <View style={styles.reportCard}>
                  <View style={styles.reportBetaBadge}>
                    <Text style={styles.reportBetaBadgeText}>베타 · 검증 중인 분석</Text>
                  </View>
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
          <>
            <View style={styles.faceWrap}>
              <FaceIllustration gender={gender} />
              {skinScore.parts.map((p) => {
                const pos = FACE_PART_PIN_POSITION[p.part];
                if (!pos) return null;
                const color = gradeToColor(p.grade);
                return (
                  <Pressable
                    key={p.part}
                    onPress={() => setSelectedPart(p)}
                    hitSlop={10}
                    style={[
                      styles.pin,
                      { left: `${pos.xPct}%`, top: `${pos.yPct}%`, backgroundColor: color },
                    ]}
                  />
                );
              })}
            </View>
            <Text style={styles.faceHint}>표시를 눌러 부위별 상세 정보를 확인하세요</Text>
          </>
        )}

        {/* 오늘의 추천 (F33) — 기록에 있던 추천을 결과에서 바로 보여준다 */}
        {recommendations.length > 0 && (
          <View style={styles.recSection}>
            <Text style={styles.sectionTitle}>오늘의 추천</Text>
            {recommendations.slice(0, 2).map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/recommendation/${r.id}`)}
                style={({ pressed }) => [styles.recCard, pressed && styles.recCardPressed]}
              >
                <EvidenceBadge grade={r.grade} />
                <View style={styles.recTextWrap}>
                  <Text style={styles.recTitle} numberOfLines={2}>{r.title}</Text>
                  <Text style={styles.recExplanation} numberOfLines={2}>{r.explanation}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        )}

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
                  <Text style={[styles.sheetGradeText, { color: gradeToColor(selectedPart.grade) }]}>
                    {selectedPart.grade}
                  </Text>
                </View>
                {selectedPart.note && <Text style={styles.sheetNote}>{selectedPart.note}</Text>}
                {(typeof selectedPart.moisture === 'number' ||
                  typeof selectedPart.elasticity === 'number') && (
                  <View style={styles.sheetMetricRow}>
                    {typeof selectedPart.moisture === 'number' && (
                      <View style={styles.sheetMetric}>
                        <Text style={styles.sheetMetricLabel}>수분</Text>
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
                        <Text style={styles.sheetMetricValue}>{selectedPart.moisture}</Text>
                      </View>
                    )}
                    {typeof selectedPart.elasticity === 'number' && (
                      <View style={styles.sheetMetric}>
                        <Text style={styles.sheetMetricLabel}>탄력</Text>
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
                        <Text style={styles.sheetMetricValue}>{selectedPart.elasticity}</Text>
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

const PIN_SIZE = 18;

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

  // 종합 점수 카드
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  overallLabel: { ...typography.bodySm, color: colors.textSecondary },
  summaryScoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  overallScore: { ...typography.displayLg, color: colors.textPrimary },
  gradePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  gradePillText: { ...typography.subtitle, fontWeight: '700' },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changeText: { ...typography.caption, fontWeight: '600' },

  faceWrap: {
    width: '88%',
    aspectRatio: 150 / 200,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  pin: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    marginLeft: -PIN_SIZE / 2,
    marginTop: -PIN_SIZE / 2,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.surface,
    ...shadow.card,
  },
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
    width: '88%',
    aspectRatio: 150 / 200,
    alignSelf: 'center',
    marginTop: spacing.sm,
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
  reportSection: { gap: spacing.xs },
  reportSectionTitle: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
  reportSectionBody: { ...typography.body, color: colors.textPrimary },

  // 오늘의 추천
  recSection: { gap: spacing.sm },
  sectionTitle: { ...typography.subtitle, color: colors.textPrimary },
  recCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  recCardPressed: { opacity: 0.7 },
  recTextWrap: { flex: 1, gap: 2 },
  recTitle: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
  recExplanation: { ...typography.caption, color: colors.textSecondary },

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
  sheetMetricRow: { flexDirection: 'row', gap: spacing.xl },
  sheetMetric: { flex: 1, gap: spacing.xs },
  sheetMetricLabel: { ...typography.caption, color: colors.textTertiary },
  sheetMetricTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gray100,
    overflow: 'hidden',
  },
  sheetMetricFill: { height: '100%', borderRadius: 4 },
  sheetMetricValue: { ...typography.headline, color: colors.textPrimary },
});
