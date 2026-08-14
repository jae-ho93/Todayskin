import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { useToast } from './Toast';
import { categoryStyle, productSearchUrl } from '../lib/care-products';
import { colors, spacing, typography } from '../theme';
import type { CareProduct } from '../types';

interface CareProductGridCardProps {
  product: CareProduct;
}

/**
 * 추천 제품 탭의 카테고리별 그리드용 카드 — 상세 카드(CareProductCard)보다 가볍게,
 * 카테고리 아이콘 + 이름 + 한줄 이유만 보여준다. 카드를 통째로 누르면 제품명으로
 * 네이버 검색 결과를 연다(특정 판매처 고정 없음, CareProductCard와 같은 정책).
 */
export function CareProductGridCard({ product }: CareProductGridCardProps) {
  const { showToast } = useToast();
  const category = categoryStyle(product.category);

  const openProductSearch = async () => {
    try {
      await Linking.openURL(productSearchUrl(product.name));
    } catch {
      showToast('검색 화면을 열 수 없어요', { type: 'error' });
    }
  };

  return (
    <Pressable
      onPress={openProductSearch}
      accessibilityRole="link"
      accessibilityLabel={`${product.name} 검색해서 구매하기`}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <Card style={styles.card}>
        <View style={[styles.iconBadge, { backgroundColor: category.bg }]}>
          <Ionicons name={category.icon} size={22} color={category.accent} />
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.reason} numberOfLines={2}>
          {product.reason}
        </Text>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={12} color={colors.sageDark} />
          <Text style={styles.searchText}>검색해서 구매하기</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '48%' },
  pressed: { opacity: 0.75 },
  card: { alignItems: 'center', gap: 6, padding: spacing.md, minHeight: 168 },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  name: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '700', textAlign: 'center' },
  reason: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  searchText: { ...typography.caption, color: colors.sageDark, fontWeight: '700', fontSize: 11 },
});
