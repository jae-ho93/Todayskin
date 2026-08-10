import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { EvidenceBadge } from '../../src/components/EvidenceBadge';
import { IngredientChip } from '../../src/components/IngredientChip';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useUserLocation } from '../../src/hooks/useUserLocation';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Product, ProductTiming } from '../../src/types';
import type { WeatherProductsFastResponse, Job } from '../src/types';

const CATEGORY_FILTERS: { key: Product['category'] | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'moisture', label: '보습' },
  { key: 'elasticity', label: '탄력' },
  { key: 'brightening', label: '미백' },
  { key: 'barrier', label: '장벽 강화' },
];

// 화장품을 실제로 쓰는 순서대로 정렬
const TIMING_ORDER: ProductTiming[] = ['세안 후', '외출 전', '외출 후'];

// 화면 7: 제품/성분 추천 리스트 — 날씨 기반 / 피부 기반 / 날씨+피부 기반 3구역
export default function ProductsScreen() {
  const { coords, loading: locationLoading } = useUserLocation();
  const [category, setCategory] = useState<Product['category'] | 'all'>('all');
  // null = 로딩 중이거나 실패 — weatherProductsLoading으로 둘을 구분한다. 오늘 날씨를 Gemini에게
  // 보내 하루 중 실제로 화장품을 쓰는 상황(세안 후/외출 전/외출 후)별로 하나씩 추천받는다.
  // 피부 기반 / 날씨+피부 기반은 아직 이 화면에 연결하지 않아 구역만 둔다.
  const [weatherProducts, setWeatherProducts] = useState<Product[] | null>(null);
  const [weatherProductsLoading, setWeatherProductsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // N12: 날씨는 서버가 직접 조회한다. 클라이언트는 좌표만 전달하고 weather 본문을
    // 보내지 않으므로 조작된 날씨로 추천을 왜곡할 수 없다.
    const weatherResponse = await api.getWeatherProductsFast(coords ?? undefined);

let products = weatherResponse?.items ?? null;
if (products !== null) {
  setWeatherProducts(products);
}

// F2: LIVE 폴링
if (weatherResponse?.source === 'LIVE' && weatherResponse?.jobId) {
  const pollInterval = setInterval(async () => {
    const job = await api.pollJob<Product[]>(weatherResponse.jobId);
    if (job?.status === 'COMPLETED' && job.result) {
      clearInterval(pollInterval);
      setWeatherProducts(job.result);
    } else if (job?.status === 'FAILED') {
      clearInterval(pollInterval);
    }
  }, 1000);
}
  }, [coords]);

  useEffect(() => {
    if (locationLoading) return;
    let cancelled = false;
    setWeatherProductsLoading(true);
    load().then(() => {
      if (!cancelled) setWeatherProductsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [locationLoading, load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filteredWeatherProducts = useMemo(() => {
    if (!weatherProducts) return weatherProducts;
    return category === 'all' ? weatherProducts : weatherProducts.filter((p) => p.category === category);
  }, [weatherProducts, category]);

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <Text style={styles.title}>추천 제품/성분</Text>

      <View style={styles.filterRow}>
        {CATEGORY_FILTERS.map((f) => {
          const active = f.key === category;
          return (
            <Pressable
              key={f.key}
              onPress={() => setCategory(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>날씨 기반 추천</Text>
        {weatherProductsLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.sage} />
            <Text style={styles.emptyText}>오늘 날씨를 분석해서 제품을 고르고 있어요…</Text>
          </View>
        ) : filteredWeatherProducts === null ? (
          <Text style={styles.emptyText}>지금은 추천을 불러올 수 없어요</Text>
        ) : filteredWeatherProducts.length > 0 ? (
          <View style={styles.list}>
            {TIMING_ORDER.map((timing) => {
              const p = filteredWeatherProducts.find((item) => item.timing === timing);
              if (!p) return null;
              return (
                <View key={timing} style={styles.timingGroup}>
                  <Text style={styles.timingLabel}>{timing}</Text>
                  <Card style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.thumb} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.brand}>{p.brand}</Text>
                        <Text style={styles.name}>{p.name}</Text>
                      </View>
                      <EvidenceBadge grade={p.matchedGrade} />
                    </View>
                    <View style={styles.chipRow}>
                      {p.matchedIngredients.map((tag) => (
                        <IngredientChip key={tag} label={tag} />
                      ))}
                    </View>
                    {p.reason && <Text style={styles.reason}>{p.reason}</Text>}
                  </Card>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>오늘 날씨 기준으로 추천할 제품이 아직 없어요</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>피부 기반 추천</Text>
        <Text style={styles.emptyText}>준비 중이에요</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>날씨+피부 기반 추천</Text>
        <Text style={styles.emptyText}>준비 중이에요</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.displaySm, color: colors.textPrimary },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.sage, borderColor: colors.sage },
  filterText: { ...typography.bodySm, color: colors.textSecondary },
  filterTextActive: { color: colors.textInverse, fontWeight: '600' },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.headline, color: colors.textPrimary },
  emptyText: { ...typography.bodySm, color: colors.textTertiary },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  list: { gap: spacing.md },
  timingGroup: { gap: spacing.xs },
  timingLabel: { ...typography.caption, color: colors.sageDark, fontWeight: '700' },
  card: { gap: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.gray100 },
  brand: { ...typography.caption, color: colors.textTertiary },
  name: { ...typography.subtitle, color: colors.textPrimary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reason: { ...typography.bodySm, color: colors.textSecondary },
});
