import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { Card } from '../../src/components/Card';
import { EvidenceBadge } from '../../src/components/EvidenceBadge';
import { IngredientChip } from '../../src/components/IngredientChip';
import { RetryButton } from '../../src/components/RetryButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useToast } from '../../src/components/Toast';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Product, Recommendation } from '../../src/types';

// 화면 5: 추천 상세 (근거등급 A/B/C 표시 핵심 화면)
export default function RecommendationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [showExplanation, setShowExplanation] = useState(true);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  // R14: null = 카탈로그 조회 실패(재시도 안내), [] = 조회 성공했고 제품이 없음.
  const [products, setProducts] = useState<Product[] | null>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const { showToast } = useToast();

  const mountedRef = useRef(true);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    const result = await api.getProducts();
    if (!mountedRef.current) return;
    setProducts(result.status === 'ok' ? result.data : null);
    setProductsLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api.getRecommendationById(id).then((result) => {
      if (cancelled) return;
      setRecommendation(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  if (loading) {
    return (
      <ScreenContainer scroll={false} style={styles.centered}>
        <ActivityIndicator color={colors.sage} />
      </ScreenContainer>
    );
  }

  if (!recommendation) {
    return (
      <ScreenContainer scroll={false} style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textTertiary} />
        <Text style={styles.unavailableTitle}>추천 정보를 불러올 수 없어요</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.unavailableCta}>
          <Text style={styles.unavailableCtaText}>닫기</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  const relatedProducts = (products ?? []).filter((p) =>
    recommendation.relatedProductIds.includes(p.id),
  );
  // 이 추천에 엮인 제품이 있는데 카탈로그를 못 불러온 경우에만 실패를 알린다.
  // 애초에 엮인 제품이 없으면 섹션 자체가 없는 게 맞다.
  const productsUnavailable =
    products === null && !productsLoading && recommendation.relatedProductIds.length > 0;

  const openPurchaseUrl = async (product: Product) => {
    if (!product.purchaseUrl) {
      showToast('이 제품의 구매 페이지는 아직 연결되지 않았어요', { type: 'info' });
      return;
    }
    try {
      await Linking.openURL(product.purchaseUrl);
    } catch {
      showToast('구매 링크를 다시 확인해주세요', { type: 'error' });
    }
  };

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

      <Text style={styles.title}>{recommendation.title}</Text>

      <Card style={styles.gradeCard}>
        <View style={styles.gradeRow}>
          <EvidenceBadge grade={recommendation.grade} size="lg" showLabel />
          <Pressable onPress={() => setShowExplanation((v) => !v)} hitSlop={8}>
            <Text style={styles.toggle}>왜 이 등급인가요? {showExplanation ? '▲' : '▼'}</Text>
          </Pressable>
        </View>

        {showExplanation && <Text style={styles.explanation}>{recommendation.explanation}</Text>}

        <Text style={styles.source}>출처: {recommendation.sourceLabel}</Text>

        {recommendation.grade === 'C' && recommendation.observationalNote && (
          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.gray500} />
            <Text style={styles.noteText}>{recommendation.observationalNote}</Text>
          </View>
        )}
      </Card>

      <View>
        <Text style={styles.sectionTitle}>관련 성분</Text>
        <View style={styles.chipRow}>
          {recommendation.ingredientTags.map((tag) => (
            <IngredientChip key={tag} label={tag} />
          ))}
        </View>
      </View>

      <View>
        {productsUnavailable ? (
          <>
            <Text style={styles.sectionTitle}>관련 제품</Text>
            <Card style={styles.productsUnavailable}>
              <Text style={styles.productsUnavailableText}>제품 정보를 불러올 수 없어요</Text>
              <RetryButton onPress={() => void loadProducts()} disabled={productsLoading} />
            </Card>
          </>
        ) : relatedProducts.length > 1 ? (
          <>
            <Text style={styles.sectionTitle}>관련 제품</Text>
            <View style={styles.productList}>
              {relatedProducts.map((p) => (
                <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`${p.name} 구매 페이지 열기`} onPress={() => openPurchaseUrl(p)} style={({ pressed }) => pressed && styles.productPressed}>
                <Card style={styles.productCard}>
                  <View style={styles.productThumb}>
                    <Ionicons name="flask-outline" size={22} color={colors.gray400} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.productBrand}>{p.brand}</Text>
                    <Text style={styles.productName}>{p.name}</Text>
                  </View>
                  <EvidenceBadge grade={p.matchedGrade} />
                </Card>
                </Pressable>
              ))}
            </View>
          </>
        ) : relatedProducts.length === 1 ? (
          <>
            <Text style={styles.sectionTitle}>관련 제품</Text>
            <Pressable accessibilityRole="link" accessibilityLabel={`${relatedProducts[0].name} 구매 페이지 열기`} onPress={() => openPurchaseUrl(relatedProducts[0])} style={({ pressed }) => pressed && styles.productPressed}>
            <Card style={styles.productCard}>
              <View style={styles.productThumb}>
                <Ionicons name="flask-outline" size={22} color={colors.gray400} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.productBrand}>{relatedProducts[0].brand}</Text>
                <Text style={styles.productName}>{relatedProducts[0].name}</Text>
              </View>
              <EvidenceBadge grade={relatedProducts[0].matchedGrade} />
            </Card>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  closeButton: { alignSelf: 'flex-end' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  unavailableTitle: { ...typography.headline, color: colors.textPrimary },
  unavailableCta: {
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  unavailableCtaText: { ...typography.subtitle, color: colors.textInverse },
  productsUnavailable: { alignItems: 'center', gap: spacing.xs },
  productsUnavailableText: { ...typography.bodySm, color: colors.textTertiary },
  title: { ...typography.displaySm, color: colors.textPrimary },
  gradeCard: { gap: spacing.md },
  gradeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggle: { ...typography.bodySm, color: colors.sageDark, fontWeight: '600' },
  explanation: { ...typography.body, color: colors.textSecondary },
  source: { ...typography.caption, color: colors.textTertiary },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.gray50,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  noteText: { ...typography.caption, color: colors.gray500, flex: 1 },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  productList: { gap: spacing.sm },
  productPressed: { opacity: 0.72 },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  productThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.gray50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productBrand: { ...typography.caption, color: colors.textTertiary },
  productName: { ...typography.subtitle, color: colors.textPrimary },
});
