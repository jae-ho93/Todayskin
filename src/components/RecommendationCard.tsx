import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Recommendation } from '../types';
import { colors, radius, spacing, typography } from '../theme';
import { Card } from './Card';
import { EvidenceBadge } from './EvidenceBadge';

export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  return (
    <Pressable
      onPress={() => router.push(`/recommendation/${recommendation.id}`)}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          {recommendation.timing && recommendation.timing !== '언제든' ? (
            <View style={styles.timingChip}>
              <Text style={styles.timingText}>{recommendation.timing}</Text>
            </View>
          ) : (
            <View />
          )}
          <EvidenceBadge grade={recommendation.grade} />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {recommendation.title}
        </Text>
        <Text style={styles.source} numberOfLines={1}>
          {recommendation.sourceLabel}
        </Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timingChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  timingText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  source: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  pressed: {
    opacity: 0.7,
  },
});
