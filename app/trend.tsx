import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { DualLineChart } from '../src/components/DualLineChart';
import { EvidenceBadge } from '../src/components/EvidenceBadge';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { mockPatternProgress, mockPersonalPattern } from '../src/data/mock';
import { colors, radius, spacing, typography } from '../src/theme';

// 화면 6: 개인 패턴 트렌드 (C등급, 2~3주 데이터 누적 후 활성화)
export default function TrendScreen() {
  const { collectedDays, requiredDays } = mockPatternProgress;
  const isUnlocked = collectedDays >= requiredDays;
  const progress = Math.min(1, collectedDays / requiredDays);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>개인 패턴 분석</Text>
        <View style={{ width: 22 }} />
      </View>

      {!isUnlocked ? (
        <Card style={styles.lockedCard}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.textTertiary} />
          <Text style={styles.lockedTitle}>
            데이터 {collectedDays}/{requiredDays}일 수집 중
          </Text>
          <Text style={styles.lockedBody}>
            개인화 분석까지 {requiredDays - collectedDays}일 남았어요.{'\n'}매일 촬영할수록 더 정확한
            패턴을 확인할 수 있어요.
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </Card>
      ) : (
        <>
          <Card style={styles.chartCard}>
            <Text style={styles.chartTitle}>{mockPersonalPattern.title}</Text>
            <DualLineChart
              series={mockPersonalPattern.series}
              primaryLabel="피부 수분도"
              secondaryLabel="PM2.5 농도"
            />
          </Card>

          <View>
            <Text style={styles.sectionTitle}>관찰된 패턴</Text>
            <Card style={styles.patternCard}>
              <View style={styles.patternHeader}>
                <EvidenceBadge grade="C" />
              </View>
              <Text style={styles.patternDesc}>{mockPersonalPattern.description}</Text>
            </Card>
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { ...typography.subtitle, color: colors.textPrimary },
  lockedCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  lockedTitle: { ...typography.headline, color: colors.textPrimary },
  lockedBody: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center' },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.sage },
  chartCard: { gap: spacing.sm },
  chartTitle: { ...typography.subtitle, color: colors.textPrimary },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.sm },
  patternCard: { gap: spacing.sm },
  patternHeader: { flexDirection: 'row' },
  patternDesc: { ...typography.body, color: colors.textSecondary },
});
