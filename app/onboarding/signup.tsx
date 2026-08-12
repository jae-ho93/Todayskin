import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useToast } from '../../src/components/Toast';
import { SocialLoginButtons } from '../../src/components/SocialLoginButtons';
import { usePhoneVerification } from '../../src/features/auth/usePhoneVerification';
import { clearPendingConsents, getPendingConsents } from '../../src/lib/pendingConsents';
import { saveSession } from '../../src/lib/session';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Gender, SocialProvider } from '../../src/types';

// 010 번호는 항상 11자리(3-4-4)다. 정규식의 \d{3,4} 같은 가변 길이 매칭을 쓰면
// 10자리까지만 입력한 상태(마지막 한 자리 남음)에서도 "완성"으로 오판해 너무 일찍 다음
// 칸으로 넘어가는 문제가 있어서, 자릿수 기준으로 명확하게 판단한다.
function formatPhoneDisplay(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function isValidPhoneDigits(digits: string): boolean {
  return digits.length === 11 && /^01[016789]/.test(digits);
}

function formatBirthDateDisplay(digits: string): string {
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  return [y, m, d].filter(Boolean).join('.');
}

function isValidBirthDate(digits: string): boolean {
  if (digits.length !== 8) return false;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  if (month < 1 || month > 12) return false;
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return false;
  }
  const now = new Date();
  if (parsed > now) return false;
  if (year < now.getFullYear() - 120) return false;
  return true;
}

function toIsoDate(digits: string): string {
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

type Field = 'name' | 'phone' | 'birthDate';

// 화면: 회원가입 — 2단계 분리 (당근 패턴).
// ① 전화번호+OTP 인증 (소셜 가입 병행) → ② 이름·생년월일·성별.
// 각 단계는 스크롤 없는 한 화면에 맞춰 구성한다.
export default function SignupScreen() {
  const { showToast } = useToast();
  const [phase, setPhase] = useState<'phone' | 'profile'>('phone');
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [gender, setGender] = useState<Gender | null>(null); // 선택 입력이라 폼 유효성엔 영향 없음
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);
  const [focusedField, setFocusedField] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneVerification = usePhoneVerification({
    purpose: 'signup',
    onError: setError,
    // F59: 문자앱 복귀 자동 검증 완료 피드백
    onVerified: () => showToast('휴대폰 인증이 완료됐어요', { type: 'success' }),
  });
  const phoneVerified = phoneVerification.verified;

  const nameInputRef = useRef<TextInput>(null);
  const birthDateInputRef = useRef<TextInput>(null);

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length > 0 && trimmedName.length <= 20;
  const isPhoneValid = isValidPhoneDigits(phoneDigits);
  const isBirthDateValid = isValidBirthDate(birthDateDigits);
  const isValid = isNameValid && phoneVerified && isBirthDateValid;

  // 2단계 진입 시 이름 입력칸에 포커스
  useEffect(() => {
    if (phase === 'profile') nameInputRef.current?.focus();
  }, [phase]);

  // 마지막 항목까지 다 채워서 폼 전체가 유효해지면 자동으로 키보드를 내려 CTA 버튼이 바로 보이게 한다
  useEffect(() => {
    if (isValid) Keyboard.dismiss();
  }, [isValid]);

  // 번호를 다시 바꾸면 이전 인증은 무효 — 새 번호로 다시 인증번호를 받아야 한다
  const handlePhoneChange = (v: string) => {
    setPhoneDigits(v.replace(/[^0-9]/g, '').slice(0, 11));
    phoneVerification.reset();
  };

  const handleSendOtp = () => {
    if (!isPhoneValid || phoneVerification.sending) return;
    void phoneVerification.sendCode(phoneDigits);
  };

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const user = await api.signup({
        phoneNumber: phoneDigits,
        name: trimmedName,
        birthDate: toIsoDate(birthDateDigits),
        gender: gender ?? undefined,
      });
      await saveSession(user);

      // 온보딩 동의 화면에서 고른 값을 이제 실제로 서버에 기록한다 — 로그인 전엔 인증이 필요한
      // 동의 등록 API를 호출할 수 없어서 토큰이 생긴 지금(가입 직후) 처음 보낸다. 이미 만든
      // 계정을 되돌릴 정도의 실패는 아니라 best-effort로만 처리하고 홈 진입은 막지 않는다.
      const pendingConsents = getPendingConsents();
      await Promise.all(
        Object.entries(pendingConsents).map(([purpose, purposeAgreed]) =>
          api.upsertConsent(purpose as Parameters<typeof api.upsertConsent>[0], purposeAgreed ?? false).catch(() => {
            // best-effort — 개별 동의 등록 실패가 가입 자체를 막지 않는다
          }),
        ),
      );
      clearPendingConsents();

      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : '가입에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialToken = useCallback(async (provider: SocialProvider, token: string, extra?: { nonce?: string }) => {
    setBusyProvider(provider);
    setError(null);
    try {
      const user = await api.socialLogin(provider, token, extra?.nonce);
      await saveSession(user);
      router.replace(user.isNewUser ? '/onboarding/consent?social=1' : '/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : '소셜 가입에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setBusyProvider(null);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {phase === 'phone' ? (
          <ScrollView
            style={styles.keyboardAvoiding}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View>
              <Text style={styles.headline}>회원가입</Text>
              <Text style={styles.subtitle}>휴대폰 인증으로 가입하거나 소셜 계정으로 바로 시작하세요</Text>
            </View>

            <View style={styles.middle}>
              <View style={styles.field}>
                <Text style={styles.label}>휴대폰 번호</Text>
                <TextInput
                  style={[styles.input, focusedField === 'phone' && styles.inputFocused]}
                  placeholder="010-1234-5678"
                  placeholderTextColor={colors.gray300}
                  keyboardType="number-pad"
                  value={formatPhoneDisplay(phoneDigits)}
                  onChangeText={handlePhoneChange}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                  maxLength={13}
                  editable={!phoneVerified}
                  // F48: iOS number-pad 완료 바
                  inputAccessoryViewID={Platform.OS === 'ios' ? 'done-bar' : undefined}
                />
                {/* number-pad 키보드는 iOS에 리턴키가 없어서, 버튼을 화면에 직접 둔다 */}
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

              {phoneVerification.codeIssued && !phoneVerified && (
                <View style={styles.field}>
                  <Text style={styles.label}>인증 문자를 보내면 자동으로 확인돼요</Text>
                  <Pressable onPress={() => void phoneVerification.openSms()} style={styles.smsButton}>
                    <Text style={styles.smsButtonText}>인증하기</Text>
                  </Pressable>
                  <View style={styles.otpActionRow}>
                    <Pressable
                      onPress={handleSendOtp}
                      disabled={phoneVerification.sending}
                      hitSlop={8}
                    >
                      <Text style={styles.nextButtonText}>새 코드 받기</Text>
                    </Pressable>
                    {phoneVerification.verifying && (
                      <ActivityIndicator size="small" color={colors.sageDark} />
                    )}
                  </View>
                </View>
              )}

              {phoneVerified && (
                <Text style={styles.verifiedText}>휴대폰 인증이 완료됐어요 ✓</Text>
              )}

              {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

              {/* F58: CTA를 필드 직하로 — 하단 고정 footer와 분리 */}
              <Pressable
                onPress={() => setPhase('profile')}
                disabled={!phoneVerified}
                style={({ pressed }) => [
                  styles.cta,
                  !phoneVerified && styles.ctaDisabled,
                  pressed && phoneVerified && styles.ctaPressed,
                ]}
              >
                <Text style={styles.ctaText}>다음</Text>
              </Pressable>

              <Pressable onPress={() => router.replace('/onboarding/login')} hitSlop={8}>
                <Text style={styles.loginLink}>이미 계정이 있으신가요? 로그인</Text>
              </Pressable>
              <SocialLoginButtons compact busyProvider={busyProvider} onToken={handleSocialToken} onError={setError} />
            </View>

            <View style={styles.footer}>
              <Text style={styles.terms}>
                가입하면{' '}
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
        ) : (
          <ScrollView
            style={styles.keyboardAvoiding}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View>
              <Pressable onPress={() => setPhase('phone')} hitSlop={8} style={styles.backLink}>
                <Text style={styles.backLinkText}>← 이전</Text>
              </Pressable>
              <Text style={styles.headline}>마지막 단계예요</Text>
              <Text style={styles.subtitle}>이름과 생년월일을 입력해주세요</Text>
            </View>

            <View style={styles.middle}>
              <View style={styles.field}>
                <Text style={styles.label}>이름</Text>
                <TextInput
                  ref={nameInputRef}
                  style={[styles.input, focusedField === 'name' && styles.inputFocused]}
                  placeholder="홍길동"
                  placeholderTextColor={colors.gray300}
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  maxLength={20}
                  returnKeyType="next"
                  onSubmitEditing={() => birthDateInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>생년월일</Text>
                <TextInput
                  ref={birthDateInputRef}
                  style={[styles.input, focusedField === 'birthDate' && styles.inputFocused]}
                  placeholder="2000.01.01"
                  placeholderTextColor={colors.gray300}
                  keyboardType="number-pad"
                  value={formatBirthDateDisplay(birthDateDigits)}
                  onChangeText={(v) => setBirthDateDigits(v.replace(/[^0-9]/g, '').slice(0, 8))}
                  onFocus={() => setFocusedField('birthDate')}
                  onBlur={() => setFocusedField(null)}
                  maxLength={10}
                  // F48: iOS number-pad 완료 바
                  inputAccessoryViewID={Platform.OS === 'ios' ? 'done-bar' : undefined}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>성별 (선택)</Text>
                <View style={styles.genderRow}>
                  {(
                    [
                      { value: 'female' as const, label: '여성' },
                      { value: 'male' as const, label: '남성' },
                    ]
                  ).map((option) => {
                    const selected = gender === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setGender(selected ? null : option.value)}
                        style={[styles.genderPill, selected && styles.genderPillSelected]}
                      >
                        <Text style={[styles.genderPillText, selected && styles.genderPillTextSelected]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

              {/* F58: CTA를 필드 직하로 — 하단 고정 footer와 분리 */}
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
                  <Text style={styles.ctaText}>가입하고 시작하기</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.footer}>
              <Text style={styles.terms}>
                가입하면{' '}
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
        )}
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
  body: { flexGrow: 1, paddingVertical: spacing.xl },
  // F62: 중앙 압축/겹침 제거 — 필드는 상단 1/3 근처(flex-start + 여백)
  middle: { flex: 1, justifyContent: 'flex-start', marginTop: spacing.xxl, gap: spacing.xl },
  headline: { ...typography.displayLg, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  backLink: { marginBottom: spacing.sm },
  backLinkText: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
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
  genderRow: { flexDirection: 'row', gap: spacing.sm },
  genderPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  genderPillSelected: {
    borderColor: colors.sage,
    backgroundColor: colors.sageLight,
  },
  genderPillText: { ...typography.subtitle, color: colors.textSecondary },
  genderPillTextSelected: { color: colors.sageDark, fontWeight: '700' },
  nextButton: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
  otpActionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextButtonText: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
  nextButtonTextDisabled: { color: colors.gray300 },
  smsButton: { borderWidth: 1, borderColor: colors.sage, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  smsButtonText: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
  verifiedText: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
  error: { ...typography.bodySm, color: colors.coralDark },
  footer: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },
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
  loginLink: {
    ...typography.body,
    color: colors.sageDark,
    fontWeight: '600',
    textAlign: 'center',
  },
  terms: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
  termsLink: { color: colors.sageDark, fontWeight: '700' },
});
