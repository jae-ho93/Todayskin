import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { EvidenceLink } from './EvidenceLink';
import { useToast } from './Toast';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../theme';
import type { CareProduct } from '../types';

interface CareProductCardProps {
  product: CareProduct;
}

/** 제품명으로 네이버 검색 결과를 연다 — 특정 판매처 하나로 고정하지 않는다. */
function productSearchUrl(name: string): string {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(name)}`;
}

/**
 * 실제 존재하는 제품 — web_search로 확인된 name만 신뢰한다(가상 제품 없음, url은 서버가
 * 실존 여부 검증용으로만 쓴다). 카드를 누르면 특정 판매처로 바로 이동하는 대신 제품명으로
 * 검색 결과를 연다 — 사용자마다 자주 쓰는 쇼핑몰이나 쿠폰이 다르기 때문이다.
 */
export function CareProductCard({ product }: CareProductCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { showToast } = useToast();
  const hasEvidence = Boolean(product.evidence && product.evidence.sourceType !== '없음');

  const openProductSearch = async () => {
    try {
      await Linking.openURL(productSearchUrl(product.name));
    } catch {
      showToast('검색 화면을 열 수 없어요', { type: 'error' });
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconBadge}>
          <Ionicons name="bag-handle-outline" size={18} color={colors.sageDark} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
        </View>
      </View>

      <Text style={styles.reason}>{product.reason}</Text>

      <Pressable
        onPress={openProductSearch}
        accessibilityRole="link"
        accessibilityLabel={`${product.name} 검색해서 구매하기`}
        style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
      >
        <Ionicons name="search-outline" size={15} color={colors.textInverse} />
        <Text style={styles.ctaText}>검색해서 구매하기</Text>
      </Pressable>

      {hasEvidence && (
        <View>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={expanded ? '근거 접기' : '근거 보기'}
            style={styles.toggleRow}
          >
            <Text style={styles.toggleText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {expanded ? '근거 접기' : '근거 보기'}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.textTertiary}
            />
          </Pressable>
          {expanded && product.evidence && <EvidenceLink evidence={product.evidence} />}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  name: { ...typography.subtitle, color: colors.textPrimary, fontSize: 16 },
  reason: { ...typography.bodySm, color: colors.textSecondary },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.sage,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
  },
  ctaButtonPressed: { backgroundColor: colors.sageDark },
  ctaText: { ...typography.bodySm, color: colors.textInverse, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toggleText: { ...typography.caption, color: colors.textTertiary },
});
