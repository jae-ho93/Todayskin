import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { EvidenceBadge } from '../../src/components/EvidenceBadge';
import { IngredientChip } from '../../src/components/IngredientChip';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Product } from '../../src/types';

const CATEGORY_FILTERS: { key: Product['category'] | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'moisture', label: '보습' },
  { key: 'elasticity', label: '탄력' },
  { key: 'brightening', label: '미백' },
  { key: 'barrier', label: '장벽 강화' },
];

// 화면 7: 제품/성분 추천 리스트
export default function ProductsScreen() {
  const [category, setCategory] = useState<Product['category'] | 'all'>('all');
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getProducts().then((result) => {
      if (!cancelled) setProducts(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => (category === 'all' ? products : products.filter((p) => p.category === category)),
    [category, products],
  );

  return (
    <ScreenContainer>
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

      <View style={styles.list}>
        {filtered.map((p) => (
          <Card key={p.id} style={styles.card}>
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
            {p.recommendationId && (
              <Pressable onPress={() => router.push(`/recommendation/${p.recommendationId}`)}>
                <Text style={styles.link}>왜 추천됐나요? →</Text>
              </Pressable>
            )}
          </Card>
        ))}
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
  list: { gap: spacing.md },
  card: { gap: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.gray100 },
  brand: { ...typography.caption, color: colors.textTertiary },
  name: { ...typography.subtitle, color: colors.textPrimary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  link: { ...typography.bodySm, color: colors.sageDark, fontWeight: '600' },
});
