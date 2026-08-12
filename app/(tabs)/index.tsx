import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { CircularGauge } from '../../src/components/CircularGauge';
import { RecommendationCard } from '../../src/components/RecommendationCard';
import { RetryButton } from '../../src/components/RetryButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useToast } from '../../src/components/Toast';
import { WeatherCard } from '../../src/components/WeatherCard';
import { useHomeDashboard } from '../../src/features/home/useHomeDashboard';
import { getSession } from '../../src/lib/session';
import { colors, MAX_FONT_SCALE, radius, shadow, spacing, typography } from '../../src/theme';

export default function HomeDashboard() {
  const [userName, setUserName] = useState<string | null>(null);
  const { showToast } = useToast();

  const {
    weather,
    skin,
    recommendations,
    liveRefreshing,
    refreshing,
    reload,
    reloadOnFocus,
  } = useHomeDashboard({
    onRefreshFailed: () =>
      showToast('새로고침하지 못했어요 — 기존 정보를 유지합니다', { type: 'error' }),
  });

  useEffect(() => {
    getSession().then((user) => setUserName(user?.name ?? null));
  }, []);

  useFocusEffect(reloadOnFocus);

  const handleRefresh = reload;

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

        {weather.status === 'success' ? (
          <WeatherCard weather={weather.data} />
        ) : weather.status === 'loading' ? (
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

        {skin.status === 'empty' && (
          <View style={styles.emptyState}>
            <Ionicons name="moon-outline" size={28} color={colors.sageDark} />
            <Text style={styles.emptyStateText}>매일 자기 전{'\n'}피부 상태를 찍어보세요!</Text>
            <Text style={styles.emptyStateSubtext}>촬영을 시작하면 오늘 날씨에 맞는 피부 스코어와 추천을 보여드려요</Text>
          </View>
        )}

        {skin.status === 'error' && (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.textTertiary} />
            <Text style={styles.emptyStateText}>피부 스코어를 불러올 수 없어요</Text>
            <Text style={styles.emptyStateSubtext}>잠시 후 다시 시도해주세요</Text>
            <RetryButton onPress={handleRefresh} disabled={refreshing} />
          </View>
        )}

        {skin.status === 'success' && (
          <>
            <View style={styles.scoreCard}>
  <CircularGauge value={skin.data.overallScore} label="종합 점수" />
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
              {liveRefreshing && <Text style={styles.refreshingLabel}>최신 추천으로 갱신 중…</Text>}
              {recommendations.status === 'loading' ? (
                <View style={styles.recommendationLoading}>
                  <ActivityIndicator color={colors.sage} />
                  <Text style={styles.recommendationLoadingText}>
                    어젯밤 피부 상태와 오늘 날씨를 분석하고 있어요…
                  </Text>
                </View>
              ) : recommendations.status === 'error' ? (
                <View style={styles.recommendationLoading}>
                  <Text style={styles.recommendationLoadingText}>추천을 불러올 수 없어요</Text>
                  <RetryButton onPress={handleRefresh} disabled={refreshing} />
                </View>
              ) : (
                <View style={styles.recommendationList}>
                  {(recommendations.status === 'success' ? recommendations.data : [])
                    .slice(0, 4)
                    .map((rec) => (
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
        {/* F76: 화면 하단 고정 FAB — 큰 글꼴에서 홈 콘텐츠를 덮지 않게 상한을 건다 */}
        <Text style={styles.fabText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          자기 전 세안 후 촬영하기
        </Text>
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
