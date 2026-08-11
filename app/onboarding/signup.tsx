import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { clearPendingConsents, getPendingConsents } from '../../src/lib/pendingConsents';
import { saveSession } from '../../src/lib/session';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Gender } from '../../src/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

type Field = 'name' | 'phone' | 'otp' | 'birthDate';

export default function SignupScreen() {
  const [step, setStep] = useState(0); // 0: 이름만, 1: +전화번호(+OTP), 2: +생년월일
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [gender, setGender] = useState<Gender | null>(null); // 선택 입력이라 폼 유효성엔 영향 없음
  const [focusedField, setFocusedField] = useState<Field | null>('name');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);
  const birthDateInputRef = useRef<TextInput>(null);

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length > 0 && trimmedName.length <= 20;
  const isPhoneValid = isValidPhoneDigits(phoneDigits);
  const isOtpValid = otpCode.length === 6;
  const isBirthDateValid = isValidBirthDate(birthDateDigits);
  const isValid = isNameValid && isPhoneValid && phoneVerified && isBirthDateValid;

  const revealStep = (next: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStep((s) => Math.max(s, next));
  };

  // 마지막 항목까지 다 채워서 폼 전체가 유효해지면 자동으로 키보드를 내려 CTA 버튼이 바로 보이게 한다
  useEffect(() => {
    if (isValid) Keyboard.dismiss();
  }, [isValid]);

  // step이 바뀌어 새 입력칸이 화면에 막 마운트된 "다음" 렌더에서 포커스를 옮긴다.
  // setStep과 같은 틱에서 바로 .focus()를 부르면 아직 마운트 전이라 씹히기 때문에 분리했다.
  useEffect(() => {
    if (step === 1) phoneInputRef.current?.focus();
    if (step === 2) birthDateInputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (otpSent) otpInputRef.current?.focus();
  }, [otpSent]);

  // 각 필드는 타이핑 도중 자동으로 넘어가지 않고, 키보드의 "다음" 버튼(리턴키)을 눌러야만 다음 칸이 나타난다
  const handleNameSubmit = () => {
    if (!isNameValid) return;
    revealStep(1);

  // 이름이 유효해지면 자동으로 전화번호 필드로 포커스 이동
  useEffect(() => {
    if (isNameValid && step === 0) {
      revealStep(1);
    }
  }, [isNameValid, step]);
  };

  // 번호를 다시 바꾸면 이전 인증은 무효 — 새 번호로 다시 인증번호를 받아야 한다
  const handlePhoneChange = (v: string) => {
    setPhoneDigits(v.replace(/[^0-9]/g, '').slice(0, 11));
    setOtpSent(false);
    setOtpCode('');
    setPhoneVerified(false);
  };

  const handleSendOtp = async () => {
    if (!isPhoneValid || sendingOtp) return;
    setSendingOtp(true);
    setError(null);
    try {
      await api.sendOtp(phoneDigits, 'signup');
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '인증번호 발송에 실패했습니다.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!isOtpValid || verifyingOtp) return;
    setVerifyingOtp(true);
    setError(null);
    try {
      await api.verifyOtp(phoneDigits, otpCode, 'signup');
      setPhoneVerified(true);
      revealStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : '인증번호가 올바르지 않습니다.');
    } finally {
      setVerifyingOtp(false);
    }
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={styles.headline}>회원가입</Text>
            <Text style={styles.subtitle}>이름, 휴대폰 번호, 생년월일만 입력하면 시작할 수 있어요</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>이름</Text>
            <TextInput
              style={[styles.input, focusedField === 'name' && styles.inputFocused]}
              placeholder="홍길동"
              placeholderTextColor={colors.gray300}
              value={name}
              onChangeText={setName}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              maxLength={20}
              returnKeyType="next"
              onSubmitEditing={handleNameSubmit}
              blurOnSubmit={false}
              autoFocus
            />
          </View>

          {step >= 1 && (
            <View style={styles.field}>
              <Text style={styles.label}>휴대폰 번호</Text>
              <TextInput
                ref={phoneInputRef}
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
              />
              {/* number-pad 키보드는 iOS에 리턴키가 없어서, 버튼을 화면에 직접 둔다 */}
              {!otpSent && !phoneVerified && (
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
          )}

          {otpSent && !phoneVerified && (
            <View style={styles.field}>
              <Text style={styles.label}>인증번호</Text>
              <TextInput
                ref={otpInputRef}
                style={[styles.input, focusedField === 'otp' && styles.inputFocused]}
                placeholder="6자리 숫자"
                placeholderTextColor={colors.gray300}
                keyboardType="number-pad"
                value={otpCode}
                onChangeText={(v) => setOtpCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                onFocus={() => setFocusedField('otp')}
                onBlur={() => setFocusedField(null)}
                maxLength={6}
              />
              <View style={styles.otpActionRow}>
                <Pressable onPress={handleSendOtp} disabled={sendingOtp} hitSlop={8}>
                  <Text style={styles.nextButtonText}>다시 받기</Text>
                </Pressable>
                <Pressable
                  onPress={handleVerifyOtp}
                  disabled={!isOtpValid || verifyingOtp}
                  hitSlop={8}
                  style={styles.nextButton}
                >
                  {verifyingOtp ? (
                    <ActivityIndicator size="small" color={colors.sageDark} />
                  ) : (
                    <Text style={[styles.nextButtonText, !isOtpValid && styles.nextButtonTextDisabled]}>
                      확인
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {step >= 2 && (
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
              />
            </View>
          )}

          {step >= 2 && (
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
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

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
              <Text style={styles.ctaText}>가입하고 시작하기</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.replace('/onboarding/login')} hitSlop={8}>
            <Text style={styles.loginLink}>이미 계정이 있으신가요? 로그인</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  keyboardAvoiding: { flex: 1 },
  scrollContent: { flexGrow: 1, gap: spacing.xxl, justifyContent: 'center', paddingVertical: spacing.xl },
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
  error: { ...typography.bodySm, color: colors.coralDark },
  footer: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },
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
});
