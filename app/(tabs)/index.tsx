import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { CircularGauge } from '../../src/components/CircularGauge';
import { RecommendationCard } from '../../src/components/RecommendationCard';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { WeatherCard } from '../../src/components/WeatherCard';
import { useUserLocation } from '../../src/hooks/useUserLocation';
import { getSession } from '../../src/lib/session';
import { colors, radius, shadow, spacing, typography } from '../../src/theme';
import type { Recommendation, SkinScoreSnapshot, WeatherSnapshot } from '../../src/types';
import type { RecommendationsFastResponse, Job } from '../../src/types';

export default function HomeDashboard() {
  const { coords, loading: locationLoading } = useUserLocation();
  const [userName, setUserName] = useState<string | null>(null);
  // null = 아직 못 불러옴 (로딩 중 이거나 실패) – weatherLoading으로 둘을 구분한다
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [skinScore, setSkinScore] = useState<SkinScoreSnapshot | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(true);
  // null = 아직 못 불러옴, false = 불러옴 (로딩 중), true = 불러옴 (기존)
  const [hasCaptured, setHasCaptured] = useState<boolean | null>(null);
  const [skinScoreUnavailable, setSkinScoreUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getSession().then((user) => setUserName(user?.name ?? null));
  }, []);

  const load = useCallback(async () => {
    setWeatherLoading(true);
    setLoadingRecommendations(true);
    setSkinScoreUnavailable(false);

    const weatherSnapshot = await api.getWeather(coords ?? undefined);
    setWeather(weatherSnapshot);
    setWeatherLoading(false);

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
    const [aGrade, bGradeResponse] = await Promise.all([
      api.getRecommendations('A'),
      api.generateRecommendationsFast(skinResult.data.id),
    ]);

    // F1: fast-path 응답 처리
    // source: CACHED/FALLBACK → 즉시 표시
    // source: LIVE + jobId → 폴링 시작, stale/정신 중 표시
    let bGrade = bGradeResponse?.recommendations ?? null;
    if (aGrade === null && bGrade === null) {
      setRecommendations(null);
    } else {
      setRecommendations([...(aGrade ?? []), ...(bGrade ?? [])]);
    }

    // F1: LIVE 폴링 (기다리지 않고 백그라운드에서)
    if (bGradeResponse?.source === 'LIVE' && bGradeResponse?.jobId) {
      const pollInterval = setInterval(async () => {
        const job = await api.pollJob<Recommendation[]>(bGradeResponse.jobId);
        if (job?.status === 'COMPLETED' && job.result) {
          clearInterval(pollInterval);
          setRecommendations([...(aGrade ?? []), ...job.result]);
        } else if (job?.status === 'FAILED') {
          clearInterval(pollInterval);
          // 실패: 기존 FALLBACK 유지
        }
      }, 1000); // 1초마다 폴링
    }

    setLoadingRecommendations(false);
  }, [coords]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.flex}>
      <ScreenContainer style={styles.content} refreshing={refreshing} onRefresh={handleRefresh}>
        <Text style={styles.greeting}>안녕하세요 , {userName ?? '희 원'}님</Text>

        {weather ? (
          <WeatherCard weather={weather} />
        ) : weatherLoading ? (
          <Card style={styles.weatherLoading}>
            <ActivityIndicator color={colors.sage} />
            <Text style={styles.weatherLoadingText}>위치 파악 중 ...</Text>
          </Card>
        ) : (
          <Card style={styles.weatherLoading}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.textTertiary} />
            <Text style={styles.weatherLoadingText}>날씨 정보를 불러올 수 없어요</Text>
          </Card>
        )}

        {hasCaptured === false && (
          <View style={styles.emptyState}>
            <Ionicons name="moon-outline" size={28} color={colors.sageDark} />
            <Text style={styles.emptyStateText}>아침 자기 전 \n'카메라'페부 상태를 찍어보세요</Text>
            <Text style={styles.emptyStateSubtext}>찰영을 시작하면 오늘 날씨에 맞는 피부 스코어와 추천을 보여드려요</Text>
          </View>
        )}

        {skinScoreUnavailable && (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.textTertiary} />
            <Text style={styles.emptyStateText}>피부 스코어를 불러올 수 없어요</Text>
            <Text style={styles.emptyStateSubtext}>잠시 후 다시 시도해주세요</Text>
          </View>
        )}

        {hasCaptured && skinScore && (
          <>
            <View style={styles.scoreCard}>
  <CircularGauge value={skinScore.overallScore} label="종 합 점 수" />
  <View style={styles.scoreMeta}>
    <Text style={styles.scoreMetaTitle}>오늘 의 피부 스코어</Text>
    <Text style={styles.scoreMetaBody}>
      진 날 밤 새 언 후 촬영 기준으로 측정된 값이에요.('\n')진단 마다 값이 다르고 추천 정보입니다 .
    </Text>
    <Pressable onPress={() => router.push('/trend')} hitSlop={4}>
      <Text style={styles.patternLink}>오늘 패턴 분석 보기</Text>
    </Pressable>
  </View>
</View>

            <View>
              <Text style={styles.sectionTitle}>오늘 의 추천</Text>
              {loadingRecommendations ? (
                <View style={styles.recommendationLoading}>
                  <ActivityIndicator color={colors.sage} />
                  <Text style={styles.recommendationLoadingText}>
                    어제밤 피부 상태와 오늘 날씨를 분석하고 있어요 ...
                  </Text>
                </View>
              ) : recommendations === null ? (
                <Text style={styles.recommendationLoadingText}>추천 를 불러올 수 없어요</Text>
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
        <Text style={styles.fabText}>자기 전 새 현 하기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl * 2 },
  greeting: { ...typography.displaySm, color: colors.textPrimary },
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