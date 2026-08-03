import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { EvidenceBadge } from '../../src/components/EvidenceBadge';
import { IngredientChip } from '../../src/components/IngredientChip';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { mockProducts, mockRecommendations } from '../../src/data/mock';
import { colors, radius, spacing, typography } from '../../src/theme';

// 화면 5: 추천 상세 (근거등급 A/B/C 표시 핵심 화면)
export default function RecommendationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [showExplanation, setShowExplanation] = useState(false);
  const recommendation = mockRecommendations.find((r) => r.id === id) ?? mockRecommendations[0];
  const relatedProducts = mockProducts.filter((p) =>
    recommendation.relatedProductIds.includes(p.id),
  );

  return (
    <ScreenContainer>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeButton}>
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

      {relatedProducts.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>관련 제품</Text>
          <View style={styles.productList}>
            {relatedProducts.map((p) => (
              <Card key={p.id} style={styles.productCard}>
                <View style={styles.productThumb}>
                  <Ionicons name="flask-outline" size={22} color={colors.gray400} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.productBrand}>{p.brand}</Text>
                  <Text style={styles.productName}>{p.name}</Text>
                </View>
                <EvidenceBadge grade={p.matchedGrade} />
              </Card>
            ))}
          </View>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  closeButton: { alignSelf: 'flex-end' },
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
