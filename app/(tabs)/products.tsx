import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { api } from '../../src/api/client';
import { CARE_PRODUCT_CATEGORY_ORDER, categoryStyle, categoryToSlug } from '../../src/lib/care-products';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../../src/theme';
import type { CareType } from '../../src/types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const CARE_TABS: { key: CareType; label: string; icon: IoniconName; bg: string; accent: string }[] = [
  { key: 'weather', label: '날씨 기반', icon: 'partly-sunny-outline', bg: '#DCEAFB', accent: '#3F6FA6' },
  { key: 'skin', label: '피부 기반', icon: 'body-outline', bg: '#DCEEDC', accent: '#4F8F5B' },
  { key: 'combined', label: '날씨+피부 기반', icon: 'water-outline', bg: '#DCF1EE', accent: '#2E8F86' },
];

// 화장품 종류(카테고리)를 고르는 화면 — 위에서 날씨/피부/날씨+피부 기준을 고르고,
// 아래 고정 카테고리 타일을 누르면 그 기준+카테고리의 추천 제품 상세로 들어간다.
export default function ProductsScreen() {
  const [activeTab, setActiveTab] = useState<CareType>('weather');
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

  function openCategory(category: (typeof CARE_PRODUCT_CATEGORY_ORDER)[number]): void {
    router.push({
      pathname: '/products/[category]',
      params: { category: categoryToSlug(category), type: activeTab, diagnosisId: diagnosisId ?? '' },
    });
  }

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      <View style={styles.titleRow}>
        <View style={styles.titleIconBadge}>
          <Ionicons name="sparkles-outline" size={16} color={colors.sageDark} />
        </View>
        <Text style={styles.title}>추천 제품</Text>
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
              style={[styles.tabCard, { backgroundColor: tab.bg }, active && { borderColor: tab.accent }]}
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

      <Text style={styles.subtitle}>화장품 종류를 골라보세요</Text>

      <View style={styles.categoryGrid}>
        {CARE_PRODUCT_CATEGORY_ORDER.map((category) => {
          const style = categoryStyle(category);
          return (
            <Pressable
              key={category}
              onPress={() => openCategory(category)}
              accessibilityRole="button"
              accessibilityLabel={category}
              style={({ pressed }) => [styles.gridTile, { backgroundColor: style.bg }, pressed && styles.tilePressed]}
            >
              <View style={styles.tileIconWrap}>
                <MaterialCommunityIcons name={style.icon} size={44} color={style.accent} />
              </View>
              <View style={styles.tileTextWrap}>
                <Text style={[styles.tileText, { color: style.accent }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {category}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
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
  subtitle: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridTile: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  // 아이콘 영역이 남은 공간을 다 차지하고 그 안에서 정중앙 정렬한다 — 라벨이 한 줄이든
  // 두 줄이든 아이콘 위치가 카드마다 밀리지 않게, 라벨은 그 아래 고정 영역에 둔다.
  tileIconWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tileTextWrap: { alignItems: 'center', justifyContent: 'center' },
  tilePressed: { opacity: 0.75 },
  tileText: {
    ...typography.subtitle,
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 16,
  },
});
