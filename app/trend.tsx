import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { RetryButton } from '../src/components/RetryButton';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors, spacing, typography } from '../src/theme';
import { api } from '../src/api/client';
import type { PatternSummary } from '../src/types';

// 화면 6: 개인 패턴 트렌드 (C등급) — 개인 시계열 데이터를 모아 피부 지표와 환경 지표의
// 상관관계를 분석해 보여준다. 백엔드 GET /diagnosis/pattern 계약(T10)과 연결된다.
//
// 데이터가 부족하면 서버는 200 + LOCKED를 반환하고, 화면은 "준비 중"을 표시한다.
// READY이면 상관 분석 결과를 강한 순으로 보여준다. 인과관계가 아님을 고정 문구로 명시한다.
// 호출 실패(네트워크 오류/5xx) 시에는 명시적으로 "불러올 수 없어요" 상태를 보여준다.
export default function TrendScreen() {
  const [pattern, setPattern] = useState<PatternSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // F75: 재시도 버튼에서 다시 부를 수 있도록 로드를 함수로 뺐다.
  // (언마운트 후 setState는 React 18+에서 무해한 no-op이라 active 플래그는 두지 않는다.)
  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const data = await api.getPattern();
      if (data === null) {
        setFailed(true);
      } else {
        setPattern(data);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>개인 패턴 분석</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <Card style={styles.stateCard}>
          <ActivityIndicator color={colors.sage} />
          <Text style={styles.stateText}>분석을 불러오는 중이에요…</Text>
        </Card>
      ) : failed ? (
        <Card style={styles.stateCard}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.textTertiary} />
          <Text style={styles.stateTitle}>불러올 수 없어요</Text>
          <Text style={styles.stateBody}>
            패턴 분석 데이터를 불러오지 못했어요.{'\n'}잠시 후 다시 시도해주세요.
          </Text>
          {/* F75: 오류 상태 재시도 일관화 — 홈·추천과 같은 방식 */}
          <RetryButton onPress={() => void load()} />
        </Card>
      ) : pattern && pattern.status === 'LOCKED' ? (
        <Card style={styles.lockedCard}>
          <Ionicons name="construct-outline" size={28} color={colors.textTertiary} />
          <Text style={styles.lockedTitle}>준비 중이에요</Text>
          <Text style={styles.lockedBody}>
            {pattern.lockedMessage ??
              '피부 상태와 날씨 데이터를 함께 모아 개인화된 패턴을 보여줄 수 있어요.'}
            {'\n\n'}
            현재 {pattern.collectedDays}일 기록 · 분석에 필요한 최소 {pattern.requiredDays}일
          </Text>
        </Card>
      ) : pattern && pattern.status === 'READY' ? (
        <ScrollView contentContainerStyle={styles.readyScroll} showsVerticalScrollIndicator={false}>
          <Card style={styles.disclaimerCard}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.disclaimerText}>
              {pattern.observationalDisclaimer ??
                '이 결과는 통계적 관찰일 뿐 인과관계를 의미하지 않아요.'}
            </Text>
          </Card>
          {pattern.correlations.length === 0 ? (
            <Card style={styles.stateCard}>
              <Text style={styles.stateBody}>
                수집된 데이터로 의미 있는 관계를 아직 찾지 못했어요.{'\n'}피부 체크를 꾸준히 기록해주세요.
              </Text>
            </Card>
          ) : (
            pattern.correlations.map((c) => (
              <Card key={`${c.skinMetric}-${c.part ?? 'overall'}-${c.envMetric}`} style={styles.corrCard}>
                <View style={styles.corrHeader}>
                  <Text style={styles.corrTitle}>
                    {c.skinMetric}
                    {c.part ? ` · ${c.part}` : ''} ↔ {c.envMetric}
                  </Text>
                  <CorrelationBadge direction={c.direction} strength={c.strength} />
                </View>
                <Text style={styles.corrValue}>상관계수 r = {c.r.toFixed(2)}</Text>
                <Text style={styles.corrMeta}>
                  샘플 {c.sampleSize}건 · {directionLabel(c.direction)} 관계
                </Text>
                {c.observationalNote ? (
                  <Text style={styles.corrNote}>{c.observationalNote}</Text>
                ) : null}
              </Card>
            ))
          )}
        </ScrollView>
      ) : null}
    </ScreenContainer>
  );
}

function CorrelationBadge({
  direction,
  strength,
}: {
  direction: string;
  strength: string;
}) {
  const tone =
    strength === 'strong'
      ? colors.coral
      : strength === 'moderate'
        ? colors.ochre
        : colors.gray400;
  return (
    <View style={[styles.badge, { backgroundColor: tone + '22' }]}>
      <Text style={[styles.badgeText, { color: tone }]}>{strengthLabel(strength)}</Text>
    </View>
  );
}

function directionLabel(direction: string): string {
  if (direction === 'positive') return '양의';
  if (direction === 'negative') return '음의';
  return '중립';
}

function strengthLabel(strength: string): string {
  switch (strength) {
    case 'strong':
      return '강함';
    case 'moderate':
      return '보통';
    case 'weak':
      return '약함';
    default:
      return '미미';
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { ...typography.subtitle, color: colors.textPrimary },
  stateCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  stateTitle: { ...typography.headline, color: colors.textPrimary },
  stateText: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center' },
  stateBody: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center' },
  lockedCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  lockedTitle: { ...typography.headline, color: colors.textPrimary },
  lockedBody: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center' },
  readyScroll: { gap: spacing.md },
  disclaimerCard: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  disclaimerText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  corrCard: { gap: spacing.xs },
  corrHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  corrTitle: { ...typography.headline, color: colors.textPrimary, flexShrink: 1 },
  corrValue: { ...typography.body, color: colors.textPrimary },
  corrMeta: { ...typography.bodySm, color: colors.textTertiary },
  corrNote: { ...typography.bodySm, color: colors.textTertiary, marginTop: spacing.xs },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 9999 },
  badgeText: { ...typography.bodySm, fontWeight: '600' },
});
