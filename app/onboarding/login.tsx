import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { saveSession } from '../../src/lib/session';
import { colors, radius, spacing, typography } from '../../src/theme';

function formatPhoneDisplay(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function isValidPhoneDigits(digits: string): boolean {
  return digits.length === 11 && /^01[016789]/.test(digits);
}

export default function LoginScreen() {
  const [phoneDigits, setPhoneDigits] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValid = isValidPhoneDigits(phoneDigits);

  // 휴대폰 번호를 형식에 맞게 다 입력하면 자동으로 키보드를 내려 로그인 버튼이 바로 보이게 한다
  useEffect(() => {
    if (isValid) Keyboard.dismiss();
  }, [isValid]);

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const user = await api.login(phoneDigits);
      await saveSession(user);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.body}>
          <View>
            <Text style={styles.headline}>로그인</Text>
            <Text style={styles.subtitle}>가입할 때 입력한 휴대폰 번호로 로그인하세요</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>휴대폰 번호</Text>
            <TextInput
              style={[styles.input, focused && styles.inputFocused]}
              placeholder="010-1234-5678"
              placeholderTextColor={colors.gray300}
              keyboardType="number-pad"
              value={formatPhoneDisplay(phoneDigits)}
              onChangeText={(v) => setPhoneDigits(v.replace(/[^0-9]/g, '').slice(0, 11))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={13}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              autoFocus
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={handleSubmit}
            disabled={!isValid || submitting}
            style={({ pressed }) => [
              styles.cta,
              (!isValid || submitting) && styles.ctaDisabled,
              pressed && isValid && !submitting && styles.ctaPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.ctaText}>로그인</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.replace('/onboarding/signup')} hitSlop={8}>
            <Text style={styles.signupLink}>아직 계정이 없으신가요? 회원가입</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  keyboardAvoiding: { flex: 1 },
  body: { flex: 1, gap: spacing.xxl, justifyContent: 'center' },
  headline: { ...typography.displayLg, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  field: { gap: spacing.sm },
  label: { ...typography.subtitle, color: colors.textSecondary },
  input: {
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    paddingHorizontal: 0,
    paddingVertical: spacing.md,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  inputFocused: {
    borderBottomColor: colors.sage,
  },
  error: { ...typography.bodySm, color: colors.coralDark },
  footer: { gap: spacing.lg, paddingBottom: spacing.xl },
  cta: {
    backgroundColor: colors.sage,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: colors.gray200 },
  ctaPressed: { backgroundColor: colors.sageDark },
  ctaText: { ...typography.headline, color: colors.textInverse },
  signupLink: {
    ...typography.body,
    color: colors.sageDark,
    fontWeight: '600',
    textAlign: 'center',
  },
});
