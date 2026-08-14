import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { colors, MAX_FONT_SCALE, spacing, typography } from '../theme';
import type { AsyncState } from '../lib/async-state';
import type { CarePlan } from '../types';

interface CareRoutinePreviewProps {
  title: string;
  state: AsyncState<CarePlan>;
  onPress: () => void;
}

/**
 * 홈 화면용 케어 루틴 요약 카드 — 첫 단계만 미리 보여주고, 누르면 케어 탭의
 * 해당 루틴(세안 후/다음날 아침)으로 이동한다. 상세(성분·양·근거)는 케어 탭에서.
 */
export function CareRoutinePreview({ title, state, onPress }: CareRoutinePreviewProps) {
  const firstStep = state.status === 'success' ? state.data.routine[0] : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>

        {state.status === 'loading' ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.sage} />
            <Text style={styles.bodyText}>케어 루틴을 만들고 있어요…</Text>
          </View>
        ) : state.status === 'error' ? (
          <Text style={styles.bodyText}>지금은 불러올 수 없어요</Text>
        ) : firstStep ? (
          <>
            <Text style={styles.stepText} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {firstStep.step}
            </Text>
            <Text style={styles.reasonText} numberOfLines={2}>
              {firstStep.reason}
            </Text>
          </>
        ) : (
          <Text style={styles.bodyText}>오늘은 추천할 루틴이 없어요</Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  card: { gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.subtitle, color: colors.textPrimary, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bodyText: { ...typography.bodySm, color: colors.textTertiary },
  stepText: { ...typography.bodySm, color: colors.sageDark, fontWeight: '600' },
  reasonText: { ...typography.caption, color: colors.textSecondary },
});
