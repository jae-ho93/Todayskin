import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors, spacing, typography } from '../src/theme';

// 화면 6: 개인 패턴 트렌드 (C등급) — 개인 시계열 데이터를 모아 상관을 분석하는 기능은
// 아직 백엔드에 연동되지 않았다. 가짜 진행률/차트를 보여주는 대신 준비 중임을 명시한다.
export default function TrendScreen() {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>개인 패턴 분석</Text>
        <View style={{ width: 22 }} />
      </View>

      <Card style={styles.lockedCard}>
        <Ionicons name="construct-outline" size={28} color={colors.textTertiary} />
        <Text style={styles.lockedTitle}>준비 중이에요</Text>
        <Text style={styles.lockedBody}>
          날씨 노출과 피부 상태를 함께 모아 개인화된 패턴을 보여주는 기능은{'\n'}아직 연동되지 않았어요.
        </Text>
      </Card>
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
});
