import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CareProductGridCard } from '../../src/components/CareProductGridCard';
import { RetryButton } from '../../src/components/RetryButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useCarePlan } from '../../src/features/care/useCarePlan';
import { categoryFromSlug, categoryStyle } from '../../src/lib/care-products';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { CareType } from '../../src/types';

const TYPE_LABEL: Record<CareType, string> = {
  weather: '날씨 기반',
  skin: '피부 기반',
  combined: '날씨+피부 기반',
  morning: '다음날 아침',
};

/**
 * 카테고리 상세 화면 — 추천 제품 탭에서 "지금 고른 기준(날씨/피부/날씨+피부) + 카테고리
 * 타일"을 눌러 들어온다. 기준은 이전 화면에서 이미 정해져 넘어오므로 여기선 그 기준
 * 하나만 로드하고, products를 이 카테고리로 필터링해서 보여준다. 새로고침은 그 기준의
 * 제품만 다시 생성한다(기존 useCarePlan.refresh와 동일 — 루틴은 그대로 두고 제품만).
 */
export default function ProductCategoryScreen() {
  const { category: slug, type, diagnosisId } = useLocalSearchParams<{
    category: string;
    type?: string;
    diagnosisId?: string;
  }>();
  const category = categoryFromSlug(slug) ?? '기타';
  const careType: CareType = type === 'skin' || type === 'combined' || type === 'morning' ? type : 'weather';
  const style = categoryStyle(category);

  const { state, refreshing, liveRefreshing, reload, refresh } = useCarePlan({
    careType,
    diagnosisId: diagnosisId || null,
  });
  const categoryProducts = state.status === 'success' ? state.data.products.filter((p) => p.category === category) : [];

  return (
    <ScreenContainer>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.closeButton}
        accessibilityRole="button"
        accessibilityLabel="닫기"
      >
        <Ionicons name="close" size={22} color={colors.textPrimary} />
      </Pressable>

      <View style={styles.titleRow}>
        <View style={styles.titleWithIcon}>
          <View style={[styles.titleIconBadge, { backgroundColor: style.bg }]}>
            <MaterialCommunityIcons name={style.icon} size={20} color={style.accent} />
          </View>
          <View>
            <Text style={styles.title}>{category}</Text>
            <Text style={styles.typeLabel}>{TYPE_LABEL[careType]}</Text>
          </View>
        </View>
        {state.status === 'success' && (
          <Pressable
            onPress={() => void refresh()}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="다른 추천 보기"
            style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}
          >
            <Ionicons name="refresh" size={14} color={colors.sageDark} />
            <Text style={styles.refreshButtonText}>다른 추천 보기</Text>
          </Pressable>
        )}
      </View>

      {liveRefreshing && categoryProducts.length > 0 && (
        <View style={styles.refreshingRow}>
          <ActivityIndicator size="small" color={colors.sage} />
          <Text style={styles.refreshingLabel}>갱신 중</Text>
        </View>
      )}

      {state.status === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.sage} />
          <Text style={styles.bodyText}>추천을 만들고 있어요…</Text>
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.centered}>
          <Text style={styles.bodyText}>지금은 불러올 수 없어요</Text>
          <RetryButton onPress={() => void reload()} disabled={refreshing} />
        </View>
      ) : state.status === 'empty' ? (
        <View style={styles.centered}>
          <Text style={styles.bodyText}>먼저 피부를 촬영해주세요</Text>
        </View>
      ) : categoryProducts.length > 0 ? (
        <View style={styles.grid}>
          {categoryProducts.map((product, i) => (
            <CareProductGridCard key={`${product.name}-${i}`} product={product} />
          ))}
        </View>
      ) : liveRefreshing ? (
        // FALLBACK은 products가 항상 비어 있다 — LIVE job이 아직 도는 중이면 "없어요"가
        // 아니라 "찾는 중"으로 보여준다(안 그러면 매번 잠깐 빈 화면이 먼저 보인다).
        <View style={styles.centered}>
          <ActivityIndicator color={colors.sage} />
          <Text style={styles.bodyText}>이 카테고리 제품을 찾고 있어요…</Text>
        </View>
      ) : (
        <Text style={styles.bodyText}>지금 이 카테고리엔 추천할 제품이 없어요</Text>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  closeButton: { alignSelf: 'flex-end' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  titleWithIcon: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleIconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.displaySm, color: colors.textPrimary },
  typeLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  refreshButtonPressed: { opacity: 0.6 },
  refreshButtonText: { ...typography.caption, color: colors.sageDark, fontWeight: '600' },
  refreshingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  refreshingLabel: { ...typography.caption, color: colors.sageDark },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  bodyText: { ...typography.bodySm, color: colors.textTertiary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
