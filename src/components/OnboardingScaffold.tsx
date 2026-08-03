import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme';

interface OnboardingScaffoldProps {
  step: number; // 0-indexed
  totalSteps: number;
  children: ReactNode;
  ctaLabel: string;
  onPressCta: () => void;
  ctaDisabled?: boolean;
  onSkip?: () => void;
}

export function OnboardingScaffold({
  step,
  totalSteps,
  children,
  ctaLabel,
  onPressCta,
  ctaDisabled,
  onSkip,
}: OnboardingScaffoldProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <View style={styles.dots}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        {onSkip ? (
          <Pressable onPress={onSkip} hitSlop={8}>
            <Text style={styles.skip}>건너뛰기</Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      <View style={styles.body}>{children}</View>

      <Pressable
        onPress={onPressCta}
        disabled={ctaDisabled}
        style={({ pressed }) => [
          styles.cta,
          ctaDisabled && styles.ctaDisabled,
          pressed && !ctaDisabled && styles.ctaPressed,
        ]}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gray200,
  },
  dotActive: {
    backgroundColor: colors.sage,
    width: 20,
  },
  skip: {
    ...typography.bodySm,
    color: colors.textTertiary,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xxl,
  },
  cta: {
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaDisabled: {
    backgroundColor: colors.gray200,
  },
  ctaPressed: {
    backgroundColor: colors.sageDark,
  },
  ctaText: {
    ...typography.headline,
    color: colors.textInverse,
  },
});
