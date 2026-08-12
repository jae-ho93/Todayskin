import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { NO_SOURCE_NOTICE } from '../lib/evidence';
import { colors, radius, spacing, typography } from '../theme';
import type { EvidenceSource } from '../types';

interface EvidenceSourceListProps {
  sources: EvidenceSource[];
  /** sources가 비었을 때 대신 보여줄 등급 표기 (예: 'AI 생성 · 내 진단 결과 기반'). */
  fallbackLabel: string;
  onOpenFailed?: (source: EvidenceSource) => void;
}

/**
 * F69: 근거 표기.
 *
 * 예전에는 실제 참조든 AI 생성물이든 똑같이 `출처: ...` 한 줄로 붙였다. 같은
 * 라벨을 쓰면 생성물도 인용처럼 읽힌다. 그래서 둘을 다르게 그린다.
 *
 * - 참조가 있으면: 눌러서 원문을 여는 목록. 기관·연도를 함께 보여 확인 가능하게 한다.
 * - 참조가 없으면: 인용이 없다고 말한다. 출처 칸을 그럴듯한 문구로 채우지 않는다.
 */
export function EvidenceSourceList({
  sources,
  fallbackLabel,
  onOpenFailed,
}: EvidenceSourceListProps) {
  if (sources.length === 0) {
    return (
      <View style={styles.noSourceBox}>
        <Ionicons name="sparkles-outline" size={14} color={colors.textTertiary} />
        <Text style={styles.noSourceText}>
          {fallbackLabel} · {NO_SOURCE_NOTICE}
        </Text>
      </View>
    );
  }

  const open = async (source: EvidenceSource) => {
    try {
      await Linking.openURL(source.url);
    } catch {
      onOpenFailed?.(source);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>근거 문서</Text>
      {sources.map((source) => (
        <Pressable
          key={source.id}
          onPress={() => void open(source)}
          accessibilityRole="link"
          accessibilityLabel={`${source.publisher} ${source.title} 원문 열기`}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.rowText}>
            <Text style={styles.publisher}>
              {source.publisher} · {source.year}
            </Text>
            <Text style={styles.title}>{source.title}</Text>
          </View>
          <Ionicons name="open-outline" size={16} color={colors.sageDark} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  heading: { ...typography.caption, color: colors.textTertiary, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gray50,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowPressed: { opacity: 0.72 },
  rowText: { flex: 1, gap: 2 },
  publisher: { ...typography.caption, color: colors.textTertiary },
  title: { ...typography.bodySm, color: colors.textPrimary },
  noSourceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  noSourceText: { ...typography.caption, color: colors.textTertiary, flex: 1 },
});
