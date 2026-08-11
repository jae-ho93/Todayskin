import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TERMS_SECTIONS } from '../../src/lib/legal';
import { colors, spacing, typography } from '../../src/theme';

export default function TermsScreen() {
  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.headline, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  effective: { ...typography.caption, color: colors.textTertiary },
  section: { gap: spacing.xs },
  sectionTitle: { ...typography.subtitle, color: colors.textPrimary },
  sectionBody: { ...typography.bodySm, color: colors.textSecondary, lineHeight: 20 },
});
