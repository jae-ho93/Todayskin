import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
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
  const [recipientNumber, setRecipientNumber] = useState('');
  const [focused, setFocused] = useState<'phone' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);
  // F34: “인증하기”로 문자 앱을 연 뒤에만 복귀 시 자동 검증한다 — 실수로 백그라운드만
  // 다녀와도 인증을 시도하지 않게 smsOpenedRef로 게이트한다.
  const smsOpenedRef = useRef(false);
  const submitRef = useRef<() => Promise<void>>(async () => {});

  const isPhoneValid = isValidPhoneDigits(phoneDigits);
  const isOtpValid = otpCode.length === 6;

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
      const response = await api.sendOtp(phoneDigits, 'login');
      setOtpCode(response.code);
      setRecipientNumber(response.recipientNumber);
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '인증번호 발송에 실패했습니다.');
    } finally {
      setSendingOtp(false);
    }
  };

  const openSms = async () => {
    try {
      smsOpenedRef.current = true;
      // iOS는 `?body=` 대신 `&body=`를 요구한다 — 플랫폼별로 구분해서 문자 시트가
      // 본문까지 채워진 채 열리게 한다 (보내고 돌아오면 AppState로 자동 검증).
      const sep = Platform.OS === 'ios' ? '&' : '?';
      await Linking.openURL(
        `sms:${recipientNumber}${sep}body=${encodeURIComponent(`인증코드 ${otpCode}`)}`,
      );
    } catch {
      setError('문자 앱을 열 수 없어요. 다시 시도해주세요.');
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
      setError(e instanceof Error ? e.message : '인증을 확인하지 못했어요. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };
  submitRef.current = handleSubmit;

  // F34: 문자 앱에서 복귀하면 자동으로 인증을 확인한다 (수동 버튼 대체).
  useEffect(() => {
    if (!otpSent || submitting) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && smsOpenedRef.current && otpCode.length === 6) {
        void submitRef.current();
      }
    });
    return () => subscription.remove();
  }, [otpSent, submitting, otpCode]);

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
        {/* 스크롤 없는 한 화면 — 헤드라인/입력칸/CTA+소셜이 세로 공간을 나눠 갖는다 */}
        <View style={styles.body}>
          <View>
            <Text style={styles.headline}>로그인</Text>
            <Text style={styles.subtitle}>휴대폰 인증 또는 소셜 계정으로 안전하게 로그인하세요</Text>
          </View>

          <View style={styles.middle}>
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
                      문자 인증 시작하기
                    </Text>
                  )}
                </Pressable>
              )}
            </View>

            {otpSent && (
              <View style={styles.field}>
                <Text style={styles.label}>인증 문자를 보내면 자동으로 확인돼요</Text>
                <Pressable onPress={openSms} style={styles.smsButton}>
                  <Text style={styles.smsButtonText}>인증하기</Text>
                </Pressable>
                <Pressable onPress={handleSendOtp} disabled={sendingOtp} hitSlop={8} style={styles.nextButton}>
                  <Text style={styles.nextButtonText}>새 코드 받기</Text>
                </Pressable>
              </View>
            )}

            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={handleSubmit}
              disabled={!otpSent || submitting}
              style={({ pressed }) => [
                styles.cta,
                (!otpSent || submitting) && styles.ctaDisabled,
                pressed && otpSent && !submitting && styles.ctaPressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.ctaText}>{otpSent ? (error ? '다시 시도' : '인증 확인') : '로그인'}</Text>
              )}
            </Pressable>

            <Pressable onPress={() => router.replace('/onboarding/signup')} hitSlop={8}>
              <Text style={styles.signupLink}>아직 계정이 없으신가요? 회원가입</Text>
            </Pressable>
            <SocialLoginButtons compact busyProvider={busyProvider} onToken={handleSocialToken} onError={setError} />
            <Text style={styles.terms}>
              계속하면{' '}
              <Text style={styles.termsLink} onPress={() => router.push('/legal/terms')}>
                이용약관
              </Text>
              과{' '}
              <Text style={styles.termsLink} onPress={() => router.push('/legal/privacy')}>
                개인정보 처리방침
              </Text>
              에 동의한 것으로 간주됩니다.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  keyboardAvoiding: { flex: 1 },
  body: { flex: 1, justifyContent: 'space-between', paddingVertical: spacing.xl },
  middle: { gap: spacing.xl },
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
  smsButton: { borderWidth: 1, borderColor: colors.sage, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  smsButtonText: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
  terms: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
  termsLink: { color: colors.sageDark, fontWeight: '700' },
});
