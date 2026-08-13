import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useToast } from './Toast';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../theme';
import type { CareEvidence } from '../types';

interface EvidenceLinkProps {
  evidence: CareEvidence;
}

/**
 * web_search로 실제 확인된 근거 하나. sourceType이 '없음'이면(=서버가 evidence를
 * null로 내려보내야 정상이지만 방어적으로) 아무것도 렌더링하지 않는다 —
 * "근거처럼 보이는 것"을 근거 없이 보여주지 않는다.
 */
export function EvidenceLink({ evidence }: EvidenceLinkProps) {
  const { showToast } = useToast();
  if (evidence.sourceType === '없음' || !evidence.sourceUrl) return null;

  const openLink = async () => {
    try {
      await Linking.openURL(evidence.sourceUrl as string);
    } catch {
      showToast('출처 링크를 열 수 없어요', { type: 'error' });
    }
  };

  return (
    <Pressable
      onPress={openLink}
      accessibilityRole="link"
      accessibilityLabel={`근거 출처 ${evidence.sourceName ?? evidence.sourceType} 열기`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {evidence.sourceType}
        </Text>
      </View>
      <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {evidence.sourceName ?? '출처 보기'}
      </Text>
      <Ionicons name="open-outline" size={14} color={colors.sageDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  pressed: { opacity: 0.7 },
  badge: {
    backgroundColor: colors.sageLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { ...typography.caption, color: colors.sageDark, fontWeight: '700' },
  name: { ...typography.caption, color: colors.sageDark, textDecorationLine: 'underline', maxWidth: 180 },
});
