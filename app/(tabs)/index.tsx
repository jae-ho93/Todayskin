import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { CircularGauge } from '../../src/components/CircularGauge';
import { RecommendationCard } from '../../src/components/RecommendationCard';
import { RetryButton } from '../../src/components/RetryButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useToast } from '../../src/components/Toast';
import { WeatherCard } from '../../src/components/WeatherCard';
import { useUserLocation } from '../../src/hooks/useUserLocation';
import { getSession } from '../../src/lib/session';
import { colors, radius, shadow, spacing, typography } from '../../src/theme';
import type { Recommendation, SkinScoreSnapshot, WeatherSnapshot } from '../../src/types';

export default function HomeDashboard() {
  const { coords, loading: locationLoading } = useUserLocation();
  const [userName, setUserName] = useState<string | null>(null);
  // null = 아직 못 불러옴 (로딩 중 이거나 실패) – weatherLoading으로 둘을 구분한다
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [skinScore, setSkinScore] = useState<SkinScoreSnapshot | null>(null);
  // null = A·B등급 모두 실패 → "불러올 수 없어요". 빈 배열 = 조회 성공, 추천 없음.
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(true);
  const [recommendationsRefreshing, setRecommendationsRefreshing] = useState(false);
  // SSE/polling job 대기 취소용 — 재호출·언마운트 시 이전 대기를 중단한다.
  const jobAbortRef = useRef<AbortController | null>(null);
  // null = 아직 못 불러옴, false = 불러옴 (로딩 중), true = 불러옴 (기존)
  const [hasCaptured, setHasCaptured] = useState<boolean | null>(null);
  const [skinScoreUnavailable, setSkinScoreUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // F52: in-flight 가드·최초 로드 완료·기존 데이터 유무 마커
  // (새로고침 버튼·당겨서 갱신·포커스 자동 갱신 중복 호출 방지 + 오류 시 화면 유지)
  const loadInFlightRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const hasDataRef = useRef(false);
  const { showToast } = useToast();

  useEffect(() => {
    getSession().then((user) => setUserName(user?.name ?? null));
    return () => {
      jobAbortRef.current?.abort();
    };
  }, []);

  const load = useCallback(async () => {
    // F52: 이미 갱신 중이면 중복 호출을 차단한다 (무한 폴링/시간 밀림 방지).
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    try {
      jobAbortRef.current?.abort();
      jobAbortRef.current = null;
      setRecommendationsRefreshing(false);
      setWeatherLoading(true);
      setLoadingRecommendations(true);
      setSkinScoreUnavailable(false);

      const weatherResult = await api.getWeather(coords ?? undefined);
      setWeather(weatherResult.status === 'ok' ? weatherResult.data : null);
      setWeatherLoading(false);
      hasDataRef.current = true;

    const skinResult = await api.getSkinScore();

    if (skinResult.status === 'not_found') {
      setHasCaptured(false);
      setLoadingRecommendations(false);
      return;
    }
    if (skinResult.status === 'error') {
      setSkinScoreUnavailable(true);
      setLoadingRecommendations(false);
      return;
    }

    setHasCaptured(true);
    setSkinScore(skinResult.data);

    // A등급 (공인 가이드라인)은 날씨 만으로 즉시 판단, B등급은 전담 서버에
    // 전달해 서버가 소유권을 확인한 뒤 지장된 파부·날씨 데이터를 사용한다.
    const [aGradeResult, bGradeResponse] = await Promise.all([
      api.getRecommendations('A'),
      api.generateRecommendationsFast(skinResult.data.id),
    ]);

    // R14: 조회 실패(null)와 "성공했지만 A등급 추천 없음"(빈 배열)을 구분한다.
    const aGrade = aGradeResult.status === 'ok' ? aGradeResult.data : null;

    // F1: fast-path 응답 처리
    // source: CACHED/FALLBACK → 실제품을 즉시 표시하고 jobId가 있으면 LIVE 결과로 교체한다.
    // source: LIVE → 이미 최신 결과이므로 polling하지 않는다.
    const bGrade = bGradeResponse?.recommendations ?? null;
    if (aGrade === null && bGrade === null) {
      setRecommendations(null);
    } else {
      setRecommendations([...(aGrade ?? []), ...(bGrade ?? [])]);
    }

    if (bGradeResponse?.source !== 'LIVE' && bGradeResponse?.jobId) {
      // SSE 우선, 실패 시 폴링 폴백 — waitForJob 내부에서 처리 (F0)
      setRecommendationsRefreshing(true);
      const controller = new AbortController();
      jobAbortRef.current = controller;
      void api.waitForJob<Recommendation>(bGradeResponse.jobId, { signal: controller.signal }).then((job) => {
        if (jobAbortRef.current === controller) jobAbortRef.current = null;
        if (job?.status === 'COMPLETED' && job.result) {
          // F38: job.result는 { recommendations: [...] } 래핑 객체 — 배열로 언랩
          const live = (job.result as { recommendations?: Recommendation[] } | null)
            ?.recommendations ?? [];
          setRecommendations([...(aGrade ?? []), ...live]);
        }
        // 실패/timeout/취소: 현재 CACHED/FALLBACK 결과를 유지한다.
        setRecommendationsRefreshing(false);
      });
    }

      setLoadingRecommendations(false);
    } catch {
      // F52: 오류 시 기존 데이터 유지 — 화면 블랭크/무한 스피너 방지.
      // 이미 데이터가 있으면 토스트만 띄우고 그대로 둔다.
      setWeatherLoading(false);
      setLoadingRecommendations(false);
      if (hasDataRef.current) {
        showToast('새로고침하지 못했어요 — 기존 정보를 유지합니다', { type: 'error' });
      } else {
        setSkinScoreUnavailable(true);
      }
    } finally {
      loadInFlightRef.current = false;
      initialLoadDoneRef.current = true;
    }
  }, [coords, showToast]);

  // F24 복원: 첫 진입 시 데이터 로드 — 위치 권한 응답(허용/거부)이 결정될 때까지 기다렸다가
  // 조회한다. 거부돼도 coords만 없을 뿐 getWeather가 서버 기본 지역(서울)으로 폴백하므로
  // 화면은 그대로 진행된다. (9e0608a에서 삭제된 로직을 aa46e59 기준으로 복원)
  useEffect(() => {
    if (locationLoading) return;
    load();
  }, [locationLoading, load]);

  // F52: 화면 포커스 복귀 시 1회 자동 갱신 (첫 진입은 위 effect가 처리).
  // in-flight 가드가 중복 호출을 막아 시간 밀림을 방지한다.
  useFocusEffect(
    useCallback(() => {
      if (!initialLoadDoneRef.current) return;
      load();
    }, [load]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.flex}>
      <ScreenContainer style={styles.content} refreshing={refreshing} onRefresh={handleRefresh}>
        <View style={styles.headerRow}>
          <Text style={styles.greeting}>안녕하세요, {userName ?? '회원'}님</Text>
          <Pressable
            onPress={handleRefresh}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="새로고침"
            style={styles.refreshButton}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.sage} />
            ) : (
              <Ionicons name="refresh" size={20} color={colors.sageDark} />
            )}
          </Pressable>
        </View>

        {weather ? (
          <WeatherCard weather={weather} />
        ) : weatherLoading ? (
          <Card style={styles.weatherLoading}>
            <ActivityIndicator color={colors.sage} />
            <Text style={styles.weatherLoadingText}>위치 파악 중...</Text>
          </Card>
        ) : (
          <Card style={styles.weatherLoading}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.textTertiary} />
            <Text style={styles.weatherLoadingText}>날씨 정보를 불러올 수 없어요</Text>
            <RetryButton onPress={handleRefresh} disabled={refreshing} />
          </Card>
        )}

        {hasCaptured === false && (
          <View style={styles.emptyState}>
            <Ionicons name="moon-outline" size={28} color={colors.sageDark} />
            <Text style={styles.emptyStateText}>매일 자기 전{'\n'}피부 상태를 찍어보세요!</Text>
            <Text style={styles.emptyStateSubtext}>촬영을 시작하면 오늘 날씨에 맞는 피부 스코어와 추천을 보여드려요</Text>
          </View>
        )}

        {skinScoreUnavailable && (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.textTertiary} />
            <Text style={styles.emptyStateText}>피부 스코어를 불러올 수 없어요</Text>
            <Text style={styles.emptyStateSubtext}>잠시 후 다시 시도해주세요</Text>
            <RetryButton onPress={handleRefresh} disabled={refreshing} />
          </View>
        )}

        {hasCaptured && skinScore && (
          <>
            <View style={styles.scoreCard}>
  <CircularGauge value={skinScore.overallScore} label="종합 점수" />
  <View style={styles.scoreMeta}>
    <Text style={styles.scoreMetaTitle}>오늘의 피부 스코어</Text>
    <Text style={styles.scoreMetaBody}>
      전날 밤 세안 후 촬영 기준으로 측정된 값이에요.{'\n'}진단이 아닌 추정값입니다.
    </Text>
    <Pressable onPress={() => router.push('/trend')} hitSlop={4}>
      <Text style={styles.patternLink}>개인 패턴 분석 보기 →</Text>
    </Pressable>
  </View>
</View>

            <View>
              <Text style={styles.sectionTitle}>오늘의 추천</Text>
              {recommendationsRefreshing && <Text style={styles.refreshingLabel}>최신 추천으로 갱신 중…</Text>}
              {loadingRecommendations ? (
                <View style={styles.recommendationLoading}>
                  <ActivityIndicator color={colors.sage} />
                  <Text style={styles.recommendationLoadingText}>
                    어젯밤 피부 상태와 오늘 날씨를 분석하고 있어요…
                  </Text>
                </View>
              ) : recommendations === null ? (
                <View style={styles.recommendationLoading}>
                  <Text style={styles.recommendationLoadingText}>추천을 불러올 수 없어요</Text>
                  <RetryButton onPress={handleRefresh} disabled={refreshing} />
                </View>
              ) : (
                <View style={styles.recommendationList}>
                  {recommendations.slice(0, 4).map((rec) => (
                    <RecommendationCard key={rec.id} recommendation={rec} />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScreenContainer>

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push('/camera-guide')}
      >
        <Ionicons name="camera-outline" size={20} color={colors.textInverse} />
        <Text style={styles.fabText}>자기 전 세안 후 촬영하기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl * 2 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  greeting: { ...typography.displaySm, color: colors.textPrimary, flexShrink: 1 },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  weatherLoading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  weatherLoadingText: { ...typography.bodySm, color: colors.textSecondary },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    ...shadow.card,
  },
  emptyStateText: {
    ...typography.headline,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  scoreMeta: { flex: 1, gap: spacing.xs },
  scoreMetaTitle: { ...typography.subtitle, color: colors.textPrimary },
  scoreMetaBody: { ...typography.bodySm, color: colors.textSecondary },
  patternLink: { ...typography.bodySm, color: colors.sageDark, fontWeight: '600', marginTop: spacing.xs },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.sm },
  recommendationLoading: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  recommendationLoadingText: { ...typography.bodySm, color: colors.textSecondary },
  refreshingLabel: { ...typography.caption, color: colors.sageDark, marginBottom: spacing.sm },
  recommendationList: { gap: spacing.sm },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.coral,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadow.card,
  },
  fabPressed: { backgroundColor: colors.coralDark },
  fabText: { ...typography.subtitle, color: colors.textInverse },
});
