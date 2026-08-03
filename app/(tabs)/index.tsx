import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { CircularGauge } from '../../src/components/CircularGauge';
import { RecommendationCard } from '../../src/components/RecommendationCard';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { WeatherCard } from '../../src/components/WeatherCard';
import { mockSkinScore, mockWeather } from '../../src/data/mock';
import { useUserLocation } from '../../src/hooks/useUserLocation';
import { getHasCapturedSkin, getSession } from '../../src/lib/session';
import { colors, radius, shadow, spacing, typography } from '../../src/theme';
import type { Recommendation, SkinScoreSnapshot, WeatherSnapshot } from '../../src/types';

export default function HomeDashboard() {
  const { coords, loading: locationLoading } = useUserLocation();
  const [weather, setWeather] = useState<WeatherSnapshot>(mockWeather);
  const [skinScore, setSkinScore] = useState<SkinScoreSnapshot>(mockSkinScore);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(true);
  // null = 아직 확인 중, false = 촬영 기록 없음(신규 유저), true = 촬영 기록 있음
  const [hasCaptured, setHasCaptured] = useState<boolean | null>(null);

  useEffect(() => {
    // 위치 권한 응답(허용/거부)이 결정될 때까지 기다렸다가 조회 — 거부돼도 coords만 없을 뿐
    // getWeather가 서버 기본 지역(서울)으로 알아서 폴백하므로 화면은 그대로 진행된다
    if (locationLoading) return;

    let cancelled = false;

    async function load() {
      const weatherSnapshot = await api.getWeather(coords ?? undefined);
      if (cancelled) return;
      setWeather(weatherSnapshot);

      const user = await getSession();
      const captured = user ? await getHasCapturedSkin(user.id) : false;
      if (cancelled) return;
      setHasCaptured(captured);

      // 아직 한 번도 촬영하지 않은 유저에게는 피부 점수/추천을 보여줄 근거 자체가 없으므로
      // 목업으로라도 채우지 않고 날씨만 보여준다 (Gemini 호출도 하지 않아 불필요한 비용을 아낀다)
      if (!captured) {
        setLoadingRecommendations(false);
        return;
      }

      const skinSnapshot = await api.getSkinScore();
      if (cancelled) return;
      setSkinScore(skinSnapshot);

      // A등급(공인 가이드라인)은 날씨만으로 즉시 판단, B등급은 어젯밤 촬영한 피부 상태 +
      // 오늘 날씨를 함께 Gemini에 보내 근거 기반으로 생성
      const [aGrade, bGrade] = await Promise.all([
        api.getRecommendations('A'),
        api.generateRecommendations(skinSnapshot, weatherSnapshot),
      ]);
      if (cancelled) return;
      setRecommendations([...aGrade, ...bGrade]);
      setLoadingRecommendations(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [locationLoading, coords]);

  return (
    <View style={styles.flex}>
      <ScreenContainer style={styles.content}>
        <View>
          <Text style={styles.greeting}>안녕하세요 👋</Text>
          <Text style={styles.title}>오늘의 날씨예요</Text>
        </View>

        <WeatherCard weather={weather} />

        {hasCaptured === false && (
          <View style={styles.emptyState}>
            <Ionicons name="moon-outline" size={28} color={colors.sageDark} />
            <Text style={styles.emptyStateText}>매일 자기 전{'\n'}피부 상태를 찍어보세요!</Text>
            <Text style={styles.emptyStateSubtext}>
              촬영을 시작하면 오늘 날씨에 맞는 피부 스코어와 추천을 보여드려요
            </Text>
          </View>
        )}

        {hasCaptured && (
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
              {loadingRecommendations ? (
                <View style={styles.recommendationLoading}>
                  <ActivityIndicator color={colors.sage} />
                  <Text style={styles.recommendationLoadingText}>
                    어젯밤 피부 상태와 오늘 날씨를 분석하고 있어요…
                  </Text>
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
  greeting: { ...typography.body, color: colors.textSecondary },
  title: { ...typography.displaySm, color: colors.textPrimary, marginTop: 2 },
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
  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.md },
  recommendationList: { gap: spacing.md },
  recommendationLoading: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  recommendationLoadingText: { ...typography.bodySm, color: colors.textSecondary },
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
