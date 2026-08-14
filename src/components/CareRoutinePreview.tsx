import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../theme';
import type { AsyncState } from '../lib/async-state';
import type { CarePlan } from '../types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface CareRoutinePreviewProps {
  title: string;
  icon: IoniconName;
  accent: string;
  accentBg: string;
  state: AsyncState<CarePlan>;
  onPress: () => void;
}

/**
 * 홈 화면용 케어 루틴 요약 카드 — 첫 단계만 미리 보여주고, 누르면 상세(케어 루틴+제품)
 * 화면으로 이동한다. icon/accent는 카드마다 달라서(세안 후=민트, 다음날 아침=하늘빛)
 * CareRoutinePhaseCard의 phase 팔레트와 같은 톤으로 홈 화면에서도 바로 구분이 된다.
 */
export function CareRoutinePreview({ title, icon, accent, accentBg, state, onPress }: CareRoutinePreviewProps) {
  const firstStep = state.status === 'success' ? state.data.routine[0] : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: accent }]}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <View style={[styles.iconBadge, { backgroundColor: accentBg }]}>
              <Ionicons name={icon} size={16} color={accent} />
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.subtitle, color: colors.textPrimary, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bodyText: { ...typography.bodySm, color: colors.textTertiary },
  stepText: { ...typography.bodySm, color: colors.sageDark, fontWeight: '600' },
  reasonText: { ...typography.caption, color: colors.textSecondary },
});
