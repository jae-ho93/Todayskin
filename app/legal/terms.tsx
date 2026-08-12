import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TERMS_SECTIONS } from '../../src/lib/legal';
import { colors, spacing, typography } from '../../src/theme';

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>이용약관</Text>
        <Ionicons name="close" size={24} color={colors.textSecondary} onPress={() => router.back()} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.effective}>시행일: 2026년 8월 12일</Text>
        {TERMS_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    // iOS 모달은 상단 inset이 0에 가까워 세이프에어리어만으로는 제목이 시트 위쪽에 붙는다.
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.headline, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  effective: { ...typography.caption, color: colors.textTertiary },
  section: { gap: spacing.xs },
  sectionTitle: { ...typography.subtitle, color: colors.textPrimary },
  sectionBody: { ...typography.bodySm, color: colors.textSecondary, lineHeight: 20 },
});
