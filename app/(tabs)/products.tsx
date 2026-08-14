import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CareProductGridCard } from '../../src/components/CareProductGridCard';
import { RetryButton } from '../../src/components/RetryButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useCarePlan } from '../../src/features/care/useCarePlan';
import { api } from '../../src/api/client';
import { groupProductsByCategory } from '../../src/lib/care-products';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../../src/theme';
import type { CareType } from '../../src/types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// 다음날 아침 케어는 홈 화면 "오늘의 루틴"에서만 다룬다 — 여기 3개는 그때그때 골라보는
// 추천 제품 전용 카테고리라 성격이 다르다(N32 카드형 개편).
const CARE_TABS: { key: CareType; label: string; icon: IoniconName; bg: string; accent: string }[] = [
  { key: 'weather', label: '날씨 기반', icon: 'partly-sunny-outline', bg: '#DCEAFB', accent: '#3F6FA6' },
  { key: 'skin', label: '피부 기반', icon: 'body-outline', bg: '#DCEEDC', accent: '#4F8F5B' },
  { key: 'combined', label: '날씨+피부 기반', icon: 'water-outline', bg: '#DCF1EE', accent: '#2E8F86' },
];

// 제품/근거 링크는 OpenAI web_search로 실시간 확인된 실제 존재하는 것만 온다(N27과 동일 원칙).
const TAB_KEYS = CARE_TABS.map((t) => t.key);

export default function ProductsScreen() {
  // 홈 화면 케어 루틴 카드에서 ?tab=combined 로 딥링크한다.
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const initialTab = TAB_KEYS.includes(tab as CareType) ? (tab as CareType) : 'weather';
  const [activeTab, setActiveTab] = useState<CareType>(initialTab);

  // 탭 화면은 언마운트되지 않고 계속 떠 있을 수 있어(React Navigation), 홈에서 다시
  // 딥링크로 들어와도 ?tab= 값이 반영되도록 파라미터 변화를 따라간다.
  useEffect(() => {
    if (tab && TAB_KEYS.includes(tab as CareType)) {
      setActiveTab(tab as CareType);
    }
  }, [tab]);

  // 피부/복합 탭은 최신 진단이 필요하다 — 촬영 전이면 촬영 유도 빈 상태를 보여준다.
  const [diagnosisId, setDiagnosisId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void api.getSkinScore().then((result) => {
      if (cancelled) return;
      setDiagnosisId(result.status === 'ok' ? result.data.id : null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { state, refreshing, liveRefreshing, reload, refresh } = useCarePlan({
    careType: activeTab,
    diagnosisId,
  });

  const needsDiagnosis = activeTab !== 'weather' && diagnosisId === null;

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={reload}>
      <View style={styles.titleRow}>
        <View style={styles.titleWithIcon}>
          <View style={styles.titleIconBadge}>
            <Ionicons name="sparkles-outline" size={16} color={colors.sageDark} />
          </View>
          <Text style={styles.title}>추천 제품</Text>
        </View>
        {state.status === 'success' && (
          <Pressable
            onPress={() => void refresh()}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="다른 추천 보기"
            style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}
          >
            <Ionicons name="refresh" size={14} color={colors.sageDark} />
            <Text style={styles.refreshButtonText}>다른 추천 보기</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.tabGrid}>
        {CARE_TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              style={[
                styles.tabCard,
                { backgroundColor: tab.bg },
                active && { borderColor: tab.accent },
              ]}
            >
              {active && (
                <View style={[styles.tabCardCheck, { backgroundColor: tab.accent }]}>
                  <Ionicons name="checkmark" size={11} color={colors.textInverse} />
                </View>
              )}
              <Ionicons name={tab.icon} size={30} color={tab.accent} />
              <Text style={[styles.tabCardText, { color: tab.accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {liveRefreshing && (
        <View style={styles.refreshingRow}>
          <ActivityIndicator size="small" color={colors.sage} />
          <Text style={styles.refreshingLabel}>갱신 중</Text>
        </View>
      )}

      {needsDiagnosis ? (
        <View style={styles.emptyState}>
          <Ionicons name="camera-outline" size={28} color={colors.sageDark} />
          <Text style={styles.emptyStateText}>먼저 피부를 촬영해주세요</Text>
          <Text style={styles.emptyStateSubtext}>
            촬영 기록을 기준으로 날씨와 피부 상태에 맞는 케어 루틴을 만들어드려요
          </Text>
          <Pressable onPress={() => router.push('/camera-guide')} style={styles.captureButton}>
            <Text style={styles.captureButtonText}>촬영하러 가기</Text>
          </Pressable>
        </View>
      ) : state.status === 'loading' || diagnosisId === undefined ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.sage} />
          <Text style={styles.emptyText}>오늘 상태를 분석해서 케어 루틴을 만들고 있어요…</Text>
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.loadingRow}>
          <Text style={styles.emptyText}>지금은 추천을 불러올 수 없어요</Text>
          <RetryButton onPress={() => void reload()} disabled={refreshing} />
        </View>
      ) : state.status === 'empty' ? (
        <Text style={styles.emptyText}>먼저 피부를 촬영해주세요</Text>
      ) : (
        <View>
          {state.data.products.length > 0 ? (
            <View style={styles.categoryList}>
              {groupProductsByCategory(state.data.products).map((group) => (
                <View key={group.category} style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>{group.category}</Text>
                  <View style={styles.grid}>
                    {group.products.map((product, i) => (
                      <CareProductGridCard key={`${product.name}-${i}`} product={product} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>지금 추천할 실제 제품을 찾지 못했어요</Text>
          )}
          {state.data.medicalDisclaimer && (
            <Text style={styles.disclaimer}>{state.data.medicalDisclaimer}</Text>
          )}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleWithIcon: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleIconBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.displaySm, color: colors.textPrimary },
  tabGrid: { flexDirection: 'row', gap: spacing.sm },
  tabCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabCardCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCardText: { ...typography.bodySm, fontWeight: '700', textAlign: 'center' },
  refreshingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  refreshingLabel: { ...typography.caption, color: colors.sageDark },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  refreshButtonPressed: { opacity: 0.6 },
  refreshButtonText: { ...typography.caption, color: colors.sageDark, fontWeight: '600' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emptyText: { ...typography.bodySm, color: colors.textTertiary },
  emptyState: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  emptyStateText: { ...typography.subtitle, color: colors.textPrimary, textAlign: 'center' },
  emptyStateSubtext: {
    ...typography.bodySm,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  captureButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  captureButtonText: { ...typography.subtitle, color: colors.textInverse },
  categoryList: { gap: spacing.lg },
  categorySection: { gap: spacing.sm },
  categoryTitle: { ...typography.subtitle, color: colors.textPrimary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  disclaimer: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
