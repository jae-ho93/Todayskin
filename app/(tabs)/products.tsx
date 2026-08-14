import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
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

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const CARE_TABS: { key: CareType; label: string; icon: IoniconName }[] = [
  { key: 'weather', label: '날씨 기반', icon: 'partly-sunny-outline' },
  { key: 'skin', label: '피부 기반', icon: 'body-outline' },
  { key: 'combined', label: '복합 기반', icon: 'water-outline' },
  { key: 'morning', label: '다음날 아침', icon: 'sunny-outline' },
];

const PAGE_TABS: { key: 'routine' | 'products'; label: string; icon: IoniconName }[] = [
  { key: 'routine', label: '케어 루틴', icon: 'clipboard-outline' },
  { key: 'products', label: '추천 제품', icon: 'bag-handle-outline' },
];

// 화면 7 개편: 케어 루틴+제품 추천 — 날씨/피부/복합/다음날 아침 4탭, 탭마다 루틴↔제품 스와이프.
// 제품/근거 링크는 OpenAI web_search로 실시간 확인된 실제 존재하는 것만 온다(N27과 동일 원칙).
const TAB_KEYS = CARE_TABS.map((t) => t.key);

export default function ProductsScreen() {
  // 홈 화면 케어 루틴 카드에서 ?tab=combined|morning 로 딥링크한다.
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
  const [pageWidth, setPageWidth] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

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

  function goToPage(i: number) {
    setActivePage(i);
    scrollRef.current?.scrollTo({ x: i * pageWidth, animated: true });
  }

  const needsDiagnosis = activeTab !== 'weather' && diagnosisId === null;

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={reload}>
      <View style={styles.titleRow}>
        <View style={styles.titleWithIcon}>
          <View style={styles.titleIconBadge}>
            <Ionicons name="sparkles-outline" size={16} color={colors.sageDark} />
          </View>
          <Text style={styles.title}>케어 루틴 · 추천 제품</Text>
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

      <View style={styles.tabRow}>
        {CARE_TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                setActiveTab(tab.key);
                setActivePage(0);
                scrollRef.current?.scrollTo({ x: 0, animated: false });
              }}
              style={[styles.tabChip, active && styles.tabChipActive]}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={active ? colors.textInverse : colors.textSecondary}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
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
          <View style={styles.pageToggleRow}>
            {PAGE_TABS.map((p, i) => {
              const active = activePage === i;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => goToPage(i)}
                  accessibilityRole="button"
                  accessibilityLabel={p.label}
                  style={[styles.pageToggle, active && styles.pageToggleActive]}
                >
                  <Ionicons
                    name={p.icon}
                    size={15}
                    color={active ? colors.sageDark : colors.textTertiary}
                  />
                  <Text
                    style={[styles.pageToggleText, active && styles.pageToggleTextActive]}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View onLayout={onPageLayout}>
            <ScrollView
              ref={scrollRef}
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
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tabChip: {
    flexGrow: 1,
    minWidth: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabChipActive: { backgroundColor: colors.sage, borderColor: colors.sage },
  tabText: { ...typography.bodySm, color: colors.textSecondary },
  tabTextActive: { color: colors.textInverse, fontWeight: '600' },
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
  pageToggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pageToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  pageToggleActive: { backgroundColor: colors.sageLight },
  pageToggleText: { ...typography.bodySm, color: colors.textTertiary, fontWeight: '600' },
  pageToggleTextActive: { color: colors.sageDark },
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gray200 },
  pageDotActive: { backgroundColor: colors.sage, width: 16 },
  disclaimer: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
