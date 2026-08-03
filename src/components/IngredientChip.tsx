import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export function IngredientChip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.sageLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  text: {
    ...typography.bodySm,
    color: colors.sageDark,
    fontWeight: '600',
  },
});
