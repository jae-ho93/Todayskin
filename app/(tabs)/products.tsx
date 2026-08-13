import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CareProductCard } from '../../src/components/CareProductCard';
import { CareRoutineCard } from '../../src/components/CareRoutineCard';
import { RetryButton } from '../../src/components/RetryButton';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { useCarePlan } from '../../src/features/care/useCarePlan';
import { api } from '../../src/api/client';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../../src/theme';
import type { CareType } from '../../src/types';

const CARE_TABS: { key: CareType; label: string }[] = [
  { key: 'weather', label: '날씨 기반' },
  { key: 'skin', label: '피부 기반' },
  { key: 'combined', label: '복합 기반' },
];

const PAGE_TABS: { key: 'routine' | 'products'; label: string }[] = [
  { key: 'routine', label: '케어 루틴' },
  { key: 'products', label: '추천 제품' },
];

// 화면 7 개편: 케어 루틴+제품 추천 — 날씨/피부/복합 기반 3탭, 탭마다 루틴↔제품 스와이프.
// 제품/근거 링크는 OpenAI web_search로 실시간 확인된 실제 존재하는 것만 온다(N27과 동일 원칙).
export default function ProductsScreen() {
  const [activeTab, setActiveTab] = useState<CareType>('weather');
  const [pageWidth, setPageWidth] = useState(0);
  const [activePage, setActivePage] = useState(0);

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

  function onPageLayout(e: LayoutChangeEvent) {
    setPageWidth(e.nativeEvent.layout.width);
  }

  function onPageScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!pageWidth) return;
    setActivePage(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
  }

  const needsDiagnosis = activeTab !== 'weather' && diagnosisId === null;

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={reload}>
      <Text style={styles.title}>케어 루틴 · 추천 제품</Text>

      <View style={styles.tabRow}>
        {CARE_TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                setActiveTab(tab.key);
                setActivePage(0);
              }}
              style={[styles.tabChip, active && styles.tabChipActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionHeaderRow}>
        {liveRefreshing ? (
          <View style={styles.refreshingRow}>
            <ActivityIndicator size="small" color={colors.sage} />
            <Text style={styles.refreshingLabel}>갱신 중</Text>
          </View>
        ) : (
          <View />
        )}
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

      {needsDiagnosis ? (
        <View style={styles.emptyState}>
          <Ionicons name="camera-outline" size={28} color={colors.sageDark} />
          <Text style={styles.emptyStateText}>먼저 피부를 촬영해주세요</Text>
          <Text style={styles.emptyStateSubtext}>
            촬영 기록을 기준으로 {activeTab === 'skin' ? '피부 상태' : '날씨와 피부 상태'}에 맞는
            케어 루틴을 만들어드려요
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
          <View onLayout={onPageLayout}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onPageScrollEnd}
            >
              <View style={[styles.page, { width: pageWidth || undefined }]}>
                {state.data.routine.length > 0 ? (
                  <View style={styles.list}>
                    {state.data.routine.map((step, i) => (
                      <CareRoutineCard key={`${step.phase}-${i}`} step={step} />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>오늘은 추천할 루틴이 없어요</Text>
                )}
              </View>
              <View style={[styles.page, { width: pageWidth || undefined }]}>
                {state.data.products.length > 0 ? (
                  <View style={styles.list}>
                    {state.data.products.map((product, i) => (
                      <CareProductCard key={`${product.name}-${i}`} product={product} />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>지금 추천할 실제 제품을 찾지 못했어요</Text>
                )}
              </View>
            </ScrollView>
          </View>
          <View style={styles.pageDots}>
            {PAGE_TABS.map((p, i) => (
              <View key={p.key} style={[styles.pageDot, activePage === i && styles.pageDotActive]} />
            ))}
          </View>
          <View style={styles.pageLabelRow}>
            {PAGE_TABS.map((p, i) => (
              <Text
                key={p.key}
                style={[styles.pageLabel, activePage === i && styles.pageLabelActive]}
              >
                {p.label}
              </Text>
            ))}
          </View>
          {state.data.medicalDisclaimer && (
            <Text style={styles.disclaimer}>{state.data.medicalDisclaimer}</Text>
          )}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.displaySm, color: colors.textPrimary },
  tabRow: { flexDirection: 'row', gap: spacing.sm },
  tabChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabChipActive: { backgroundColor: colors.sage, borderColor: colors.sage },
  tabText: { ...typography.bodySm, color: colors.textSecondary },
  tabTextActive: { color: colors.textInverse, fontWeight: '600' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
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
  page: { gap: spacing.md, paddingRight: spacing.xs },
  list: { gap: spacing.md },
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gray200 },
  pageDotActive: { backgroundColor: colors.sage, width: 16 },
  pageLabelRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.xs },
  pageLabel: { ...typography.caption, color: colors.textTertiary },
  pageLabelActive: { color: colors.sageDark, fontWeight: '700' },
  disclaimer: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
