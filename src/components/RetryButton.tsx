import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../theme';

interface RetryButtonProps {
  onPress: () => void;
  /** 재시도가 진행 중이면 스피너로 바꾸고 중복 호출을 막는다. */
  disabled?: boolean;
  label?: string;
}

/**
 * R14: "불러오지 못함" 상태에서 사용자가 할 수 있는 행동을 준다.
 *
 * 조회 실패와 "정상적으로 비어 있음"을 구분하게 됐으니(FetchResult), 실패 쪽에는
 * 안내 문구만 두지 말고 재시도 경로를 노출한다. 화면마다 버튼을 다시 만들면
 * 문구·크기가 갈리므로 여기로 모은다.
 */
export function RetryButton({ onPress, disabled = false, label = '다시 시도' }: RetryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {disabled ? (
        <ActivityIndicator size="small" color={colors.textInverse} />
      ) : (
        <Text style={styles.text} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: spacing.sm,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  text: { ...typography.subtitle, color: colors.textInverse },
});
