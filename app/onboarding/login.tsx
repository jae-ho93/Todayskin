import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { SocialLoginButtons } from '../../src/components/SocialLoginButtons';
import { saveSession } from '../../src/lib/session';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { SocialProvider } from '../../src/types';

function formatPhoneDisplay(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function isValidPhoneDigits(digits: string): boolean {
  return digits.length === 11 && /^01[016789]/.test(digits);
}

// 화면: 로그인 — 전화번호 입력 후 OTP(인증번호) 확인을 거쳐야 로그인된다 (서버가 강제)
export default function LoginScreen() {
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [focused, setFocused] = useState<'phone' | 'otp' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);

  const otpInputRef = useRef<TextInput>(null);
  const isPhoneValid = isValidPhoneDigits(phoneDigits);
  const isOtpValid = otpCode.length === 6;

  useEffect(() => {
    if (otpSent) otpInputRef.current?.focus();
  }, [otpSent]);

  // 번호를 다시 바꾸면 이전 인증은 무효 — 새 번호로 다시 인증번호를 받아야 한다
  const handlePhoneChange = (v: string) => {
    setPhoneDigits(v.replace(/[^0-9]/g, '').slice(0, 11));
    setOtpSent(false);
    setOtpCode('');
    setError(null);
  };

  const handleSendOtp = async () => {
    if (!isPhoneValid || sendingOtp) return;
    setSendingOtp(true);
    setError(null);
    try {
      await api.sendOtp(phoneDigits, 'login');
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '인증번호 발송에 실패했습니다.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSubmit = async () => {
    if (!isOtpValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.verifyOtp(phoneDigits, otpCode, 'login');
      const user = await api.login(phoneDigits);
      await saveSession(user);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialToken = useCallback(async (provider: SocialProvider, token: string) => {
    setBusyProvider(provider);
    setError(null);
    try {
      const user = await api.socialLogin(provider, token);
      await saveSession(user);
      router.replace(user.isNewUser ? '/onboarding/consent?social=1' : '/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : '소셜 로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setBusyProvider(null);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.body}>
          <View>
            <Text style={styles.headline}>로그인</Text>
            <Text style={styles.subtitle}>휴대폰 인증 또는 소셜 계정으로 안전하게 로그인하세요</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>휴대폰 번호로 로그인</Text>
            <TextInput
              style={[styles.input, focused === 'phone' && styles.inputFocused]}
              placeholder="010-1234-5678"
              placeholderTextColor={colors.gray300}
              keyboardType="number-pad"
              value={formatPhoneDisplay(phoneDigits)}
              onChangeText={handlePhoneChange}
              onFocus={() => setFocused('phone')}
              onBlur={() => setFocused(null)}
              maxLength={13}
              editable={!otpSent}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              autoFocus
            />
            {!otpSent && (
              <Pressable
                onPress={handleSendOtp}
                disabled={!isPhoneValid || sendingOtp}
                hitSlop={8}
                style={styles.nextButton}
              >
                {sendingOtp ? (
                  <ActivityIndicator size="small" color={colors.sageDark} />
                ) : (
                  <Text style={[styles.nextButtonText, !isPhoneValid && styles.nextButtonTextDisabled]}>
                    인증번호 받기
                  </Text>
                )}
              </Pressable>
            )}
          </View>

          {otpSent && (
            <View style={styles.field}>
              <Text style={styles.label}>인증번호</Text>
              <TextInput
                ref={otpInputRef}
                style={[styles.input, focused === 'otp' && styles.inputFocused]}
                placeholder="6자리 숫자"
                placeholderTextColor={colors.gray300}
                keyboardType="number-pad"
                value={otpCode}
                onChangeText={(v) => setOtpCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                onFocus={() => setFocused('otp')}
                onBlur={() => setFocused(null)}
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <Pressable onPress={handleSendOtp} disabled={sendingOtp} hitSlop={8} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>인증번호 다시 받기</Text>
              </Pressable>
            </View>
          )}

          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={handleSubmit}
            disabled={!isOtpValid || submitting}
            style={({ pressed }) => [
              styles.cta,
              (!isOtpValid || submitting) && styles.ctaDisabled,
              pressed && isOtpValid && !submitting && styles.ctaPressed,
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
          <SocialLoginButtons busyProvider={busyProvider} onToken={handleSocialToken} onError={setError} />
          <Text style={styles.terms}>계속하면 서비스 이용약관과 개인정보 처리방침에 동의한 것으로 간주됩니다.</Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  keyboardAvoiding: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', gap: spacing.xxl, paddingVertical: spacing.xl },
  body: { gap: spacing.xxl },
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
  footer: { gap: spacing.lg },
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
  nextButton: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
  nextButtonText: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
  nextButtonTextDisabled: { color: colors.gray300 },
  terms: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
});
