import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CareProductCard } from '../../src/components/CareProductCard';
import { CareRoutinePhaseCard } from '../../src/components/CareRoutinePhaseCard';
import { RetryButton } from '../../src/components/RetryButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useCarePlan } from '../../src/features/care/useCarePlan';
import { groupRoutineByPhase } from '../../src/lib/care-routine';
import { colors, spacing, typography } from '../../src/theme';
import type { CareType } from '../../src/types';

const TITLE_BY_TYPE: Partial<Record<CareType, string>> = {
  combined: '세안 후 케어',
  morning: '다음날 아침 케어',
  weather: '날씨 기반 케어',
  skin: '피부 기반 케어',
};

// 홈 화면 "오늘의 루틴" 카드에서 들어오는 상세 화면 — 기존 /recommendation/[id]와 같은
// "닫기 버튼 + 단일 스크롤" 형태로, 루틴 전체와 관련 제품을 한 화면에 보여준다.
export default function CareDetailScreen() {
  const { type, diagnosisId } = useLocalSearchParams<{ type: string; diagnosisId?: string }>();
  const careType = (type as CareType) ?? 'combined';
  const { state, reload } = useCarePlan({ careType, diagnosisId: diagnosisId ?? null });

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

      <Text style={styles.title}>{TITLE_BY_TYPE[careType] ?? '케어 루틴'}</Text>

      {state.status === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.sage} />
          <Text style={styles.bodyText}>케어 루틴을 만들고 있어요…</Text>
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.centered}>
          <Text style={styles.bodyText}>지금은 불러올 수 없어요</Text>
          <RetryButton onPress={() => void reload()} />
        </View>
      ) : state.status === 'empty' ? (
        <View style={styles.centered}>
          <Text style={styles.bodyText}>먼저 피부를 촬영해주세요</Text>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>케어 루틴</Text>
            <View style={styles.list}>
              {groupRoutineByPhase(state.data.routine).map((group) => (
                <CareRoutinePhaseCard key={group.phase} group={group} />
              ))}
            </View>
          </View>

          {state.data.products.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>관련 제품</Text>
              <View style={styles.list}>
                {state.data.products.map((product, i) => (
                  <CareProductCard key={`${product.name}-${i}`} product={product} />
                ))}
              </View>
            </View>
          )}

          {state.data.medicalDisclaimer && (
            <Text style={styles.disclaimer}>{state.data.medicalDisclaimer}</Text>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  closeButton: { alignSelf: 'flex-end' },
  title: { ...typography.displaySm, color: colors.textPrimary },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  bodyText: { ...typography.bodySm, color: colors.textTertiary },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.headline, color: colors.textPrimary },
  list: { gap: spacing.md },
  disclaimer: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
