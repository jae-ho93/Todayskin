import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  InputAccessoryView,
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
import { useToast } from '../../src/components/Toast';
import { usePhoneVerification } from '../../src/features/auth/usePhoneVerification';
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
  const { showToast } = useToast();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [focused, setFocused] = useState<'phone' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);

  const isPhoneValid = isValidPhoneDigits(phoneDigits);

  // R27/F63: 문자 인증 상태 머신(발송→문자앱→복귀 자동 검증)을 훅으로 통일한다.
  // 검증 성공(onVerified) 후 실제 로그인(토큰 발급)만 화면이 수행한다.
  const phoneVerification = usePhoneVerification({
    purpose: 'login',
    onError: setError,
    onVerified: () => void handleLogin(),
  });

  // 번호를 다시 바꾸면 이전 인증은 무효 — 새 번호로 다시 인증번호를 받아야 한다
  const handlePhoneChange = (v: string) => {
    setPhoneDigits(v.replace(/[^0-9]/g, '').slice(0, 11));
    phoneVerification.reset();
  };

  const handleSendOtp = () => {
    if (!isPhoneValid || phoneVerification.sending) return;
    void phoneVerification.sendCode(phoneDigits);
  };

  // OTP 검증은 훅이 수행했고(onVerified), 여기서는 로그인 API 호출만 한다.
  const handleLogin = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const user = await api.login(phoneDigits);
      await saveSession(user);
      // F59: 문자앱에서 돌아온 자동 검증이 끝났다는 피드백을 명시한다
      showToast('인증 완료 — 로그인되었어요', { type: 'success' });
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : '인증을 확인하지 못했어요. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [phoneDigits, showToast, submitting]);

  const handleSocialToken = useCallback(async (provider: SocialProvider, token: string, extra?: { nonce?: string }) => {
    setBusyProvider(provider);
    setError(null);
    try {
      const user = await api.socialLogin(provider, token, extra?.nonce);
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
        {/* F62: ScrollView — 키보드가 열려도 전체가 밀리지 않고 포커스된 필드만 유지한다 */}
        <ScrollView
          style={styles.keyboardAvoiding}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
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
                editable={!phoneVerification.codeIssued}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                // F48: iOS number-pad는 완료 키가 없어 키보드 위에 완료 바를 띄운다
                inputAccessoryViewID={Platform.OS === 'ios' ? 'done-bar' : undefined}
              />
              {!phoneVerification.codeIssued && (
                <Pressable
                  onPress={handleSendOtp}
                  disabled={!isPhoneValid || phoneVerification.sending}
                  hitSlop={8}
                  style={styles.nextButton}
                >
                  {phoneVerification.sending ? (
                    <ActivityIndicator size="small" color={colors.sageDark} />
                  ) : (
                    <Text style={[styles.nextButtonText, !isPhoneValid && styles.nextButtonTextDisabled]}>
                      문자 인증 시작하기
                    </Text>
                  )}
                </Pressable>
              )}
            </View>

            {phoneVerification.codeIssued && (
              <View style={styles.field}>
                <Text style={styles.label}>인증 문자를 보내면 자동으로 확인돼요</Text>
                <Pressable onPress={() => void phoneVerification.openSms()} style={styles.smsButton}>
                  <Text style={styles.smsButtonText}>인증하기</Text>
                </Pressable>
                <Pressable onPress={handleSendOtp} disabled={phoneVerification.sending} hitSlop={8} style={styles.nextButton}>
                  <Text style={styles.nextButtonText}>새 코드 받기</Text>
                </Pressable>
              </View>
            )}

            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

            {/* F54: CTA를 입력 필드 직하로 (토스식) — 하단 고정 footer와 분리 */}
            <Pressable
              onPress={() => void phoneVerification.verify()}
              disabled={!phoneVerification.codeIssued || phoneVerification.verifying || submitting}
              style={({ pressed }) => [
                styles.cta,
                (!phoneVerification.codeIssued || phoneVerification.verifying || submitting) && styles.ctaDisabled,
                pressed && phoneVerification.codeIssued && !phoneVerification.verifying && !submitting && styles.ctaPressed,
              ]}
            >
              {submitting || phoneVerification.verifying ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.ctaText}>
                  {phoneVerification.codeIssued ? (error ? '다시 시도' : '인증 확인') : '로그인'}
                </Text>
              )}
            </Pressable>

            <Pressable onPress={() => router.replace('/onboarding/signup')} hitSlop={8}>
              <Text style={styles.signupLink}>아직 계정이 없으신가요? 회원가입</Text>
            </Pressable>
            {/* F58: 소셜을 필드 흐름 안으로 — 화면 하단 고정 제거 */}
            <SocialLoginButtons compact busyProvider={busyProvider} onToken={handleSocialToken} onError={setError} />
          </View>

          <View style={styles.footer}>
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
        </ScrollView>
      </KeyboardAvoidingView>
      {/* F48: number-pad 완료 바 (iOS 전용) — 토스/카카오 패턴 */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID="done-bar">
          <View style={styles.doneBar}>
            <Pressable
              onPress={() => Keyboard.dismiss()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="키패드 닫기"
              style={styles.doneBarButton}
            >
              <Text style={styles.doneBarText}>완료</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  keyboardAvoiding: { flex: 1 },
  // F62: ScrollView contentContainer — flexGrow로 하단(약관)은 자연스럽게 내려간다
  body: { flexGrow: 1, paddingTop: spacing.xxxl, paddingBottom: spacing.xl },
  // F87: 중앙 배치는 flex 재배치(justifyContent)가 아니라 고정 오프셋으로 —
  // 키보드가 열려도 여백이 재분배되지 않아 화면이 움직이지 않고, 포커스된
  // 필드(밑줄 색)만 변한다. flexGrow도 제거해 하단 약관까지 고정(토스 패턴).
  middle: { marginTop: spacing.xxl, gap: spacing.xl },
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
  footer: { marginTop: spacing.xxxl, gap: spacing.lg },
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
  // F48: 키보드 위 완료 바
  doneBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  doneBarButton: { paddingHorizontal: spacing.md, paddingVertical: 2 },
  doneBarText: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
  nextButton: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
  nextButtonText: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
  nextButtonTextDisabled: { color: colors.gray300 },
  smsButton: { borderWidth: 1, borderColor: colors.sage, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  smsButtonText: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
  terms: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
  termsLink: { color: colors.sageDark, fontWeight: '700' },
});
