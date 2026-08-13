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

/**
 * 실제 구매 가능한 제품 — web_search로 확인된 name/url만 온다(가상 제품 없음).
 * 카드를 누르면 바로 구매 페이지로 이동하고, 근거는 접이식으로 따로 둔다.
 */
export function CareProductCard({ product }: CareProductCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { showToast } = useToast();
  const hasEvidence = Boolean(product.evidence && product.evidence.sourceType !== '없음');

  const openProductUrl = async () => {
    try {
      await Linking.openURL(product.url);
    } catch {
      showToast('구매 링크를 다시 확인해주세요', { type: 'error' });
    }
  };

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={openProductUrl}
        accessibilityRole="link"
        accessibilityLabel={`${product.name} 구매 페이지 열기`}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.thumb} />
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
          <View style={styles.linkRow}>
            <Text style={styles.linkLabel}>구매 페이지 열기</Text>
            <Ionicons name="open-outline" size={14} color={colors.sageDark} />
          </View>
        </View>
      </Pressable>

      <Text style={styles.reason}>{product.reason}</Text>

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
  pressed: { opacity: 0.72 },
  thumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.gray100 },
  headerText: { flex: 1, gap: 2 },
  name: { ...typography.subtitle, color: colors.textPrimary },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkLabel: { ...typography.caption, color: colors.sageDark, fontWeight: '600' },
  reason: { ...typography.bodySm, color: colors.textSecondary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toggleText: { ...typography.caption, color: colors.textTertiary },
});
