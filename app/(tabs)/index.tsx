import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { CareRoutinePreview } from '../../src/components/CareRoutinePreview';
import { CircularGauge } from '../../src/components/CircularGauge';
import { RetryButton } from '../../src/components/RetryButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { Skeleton } from '../../src/components/Skeleton';
import { useToast } from '../../src/components/Toast';
import { WeatherCard } from '../../src/components/WeatherCard';
import { useCarePlan } from '../../src/features/care/useCarePlan';
import { useHomeDashboard } from '../../src/features/home/useHomeDashboard';
import { useOffline } from '../../src/hooks/useOffline';
import { getSession } from '../../src/lib/session';
import { colors, MAX_FONT_SCALE, radius, shadow, spacing, typography } from '../../src/theme';

export default function HomeDashboard() {
  const [userName, setUserName] = useState<string | null>(null);
  const { showToast } = useToast();
  const offline = useOffline();

  const {
    weather,
    skin,
    refreshing,
    reload,
    reloadOnFocus,
  } = useHomeDashboard({
    onRefreshFailed: () =>
      showToast('새로고침하지 못했어요 — 기존 정보를 유지합니다', { type: 'error' }),
  });

  // 하루 순환 케어 루틴 미리보기 — 오늘의 추천(A/B/C) 아래 추가. 진단이 아직 없으면
  // (skin.status !== 'success') diagnosisId를 null로 둬서 훅이 조용히 empty로 대기한다.
  const diagnosisId = skin.status === 'success' ? skin.data.id : null;
  const afterWashCare = useCarePlan({ careType: 'combined', diagnosisId });
  const morningCare = useCarePlan({ careType: 'morning', diagnosisId });

  useEffect(() => {
    getSession().then((user) => setUserName(user?.name ?? null));
  }, []);

  useFocusEffect(reloadOnFocus);

  // F82: 배너 카피("연결되면 자동으로 다시 불러와요")를 지키는 부분 —
  // 오프라인이었다가 돌아오면 한 번 자동 갱신한다.
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (offline) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      void reload();
    }
  }, [offline, reload]);

  const handleRefresh = reload;

  return (
    <View style={styles.flex}>
      <ScreenContainer style={styles.content} refreshing={refreshing} onRefresh={handleRefresh}>
        {/* F82: 오프라인 배너 — 일반 오류 카피 대신 원인을 말해준다 */}
        {offline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.textInverse} />
            <Text style={styles.offlineBannerText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              오프라인이에요. 연결되면 자동으로 다시 불러와요
            </Text>
          </View>
        )}

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
          // F82: 통 스피너 대신 날씨 카드 골격 — 무엇이 올 자리인지 먼저 보여준다
          <Card style={styles.weatherSkeleton}>
            <View style={styles.weatherSkeletonHeader}>
              <Skeleton width={44} height={44} borderRadius={radius.full} />
              <View style={styles.weatherSkeletonLines}>
                <Skeleton width="55%" height={18} />
                <Skeleton width="35%" height={13} />
              </View>
            </View>
            <View style={styles.weatherSkeletonChips}>
              <Skeleton width={72} height={28} borderRadius={radius.full} />
              <Skeleton width={72} height={28} borderRadius={radius.full} />
              <Skeleton width={72} height={28} borderRadius={radius.full} />
            </View>
          </Card>
        ) : (
          <Card style={styles.weatherLoading}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.textTertiary} />
            <Text style={styles.weatherLoadingText}>날씨 정보를 불러올 수 없어요</Text>
            <RetryButton onPress={handleRefresh} disabled={refreshing} />
          </Card>
        )}

        {/* F82: 피부 스코어·추천 자리 스켈레톤 — 콜드 스타트에서 화면이 비지 않게 */}
        {skin.status === 'loading' && (
          <>
            <View style={styles.scoreCard}>
              <Skeleton width={120} height={120} borderRadius={radius.full} />
              <View style={styles.scoreMeta}>
                <Skeleton width="70%" height={18} />
                <Skeleton width="95%" height={13} />
                <Skeleton width="60%" height={13} />
              </View>
            </View>
            <View>
              <Text style={styles.sectionTitle}>오늘의 루틴</Text>
              <View style={styles.careRoutineList}>
                <Skeleton height={76} borderRadius={radius.lg} />
                <Skeleton height={76} borderRadius={radius.lg} />
              </View>
            </View>
          </>
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
              <Text style={styles.sectionTitle}>오늘의 루틴</Text>
              <View style={styles.careRoutineList}>
                <CareRoutinePreview
                  title="세안 후 케어"
                  state={afterWashCare.state}
                  onPress={() =>
                    router.push({ pathname: '/care/[type]', params: { type: 'combined', diagnosisId: diagnosisId ?? '' } })
                  }
                />
                <CareRoutinePreview
                  title="다음날 아침 케어"
                  state={morningCare.state}
                  onPress={() =>
                    router.push({ pathname: '/care/[type]', params: { type: 'morning', diagnosisId: diagnosisId ?? '' } })
                  }
                />
              </View>
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

  // F82: 오프라인 배너 + 로딩 스켈레톤
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.gray600,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  offlineBannerText: { ...typography.bodySm, color: colors.textInverse },
  weatherSkeleton: { gap: spacing.md },
  weatherSkeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weatherSkeletonLines: { flex: 1, gap: spacing.xs },
  weatherSkeletonChips: { flexDirection: 'row', gap: spacing.sm },
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
  careRoutineList: { gap: spacing.sm },
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
