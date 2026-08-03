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
import { saveSession } from '../../src/lib/session';
import { colors, radius, spacing, typography } from '../../src/theme';

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

type Field = 'name' | 'phone' | 'birthDate';

export default function SignupScreen() {
  const [step, setStep] = useState(0); // 0: 이름만, 1: +전화번호, 2: +생년월일
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [focusedField, setFocusedField] = useState<Field | null>('name');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneInputRef = useRef<TextInput>(null);
  const birthDateInputRef = useRef<TextInput>(null);

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length > 0 && trimmedName.length <= 20;
  const isPhoneValid = isValidPhoneDigits(phoneDigits);
  const isBirthDateValid = isValidBirthDate(birthDateDigits);
  const isValid = isNameValid && isPhoneValid && isBirthDateValid;

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

  // 각 필드는 타이핑 도중 자동으로 넘어가지 않고, 키보드의 "다음" 버튼(리턴키)을 눌러야만 다음 칸이 나타난다
  const handleNameSubmit = () => {
    if (!isNameValid) return;
    revealStep(1);
  };

  const handlePhoneSubmit = () => {
    if (!isPhoneValid) return;
    revealStep(2);
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
      });
      await saveSession(user);
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
                onChangeText={(v) => setPhoneDigits(v.replace(/[^0-9]/g, '').slice(0, 11))}
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
                maxLength={13}
              />
              {/* number-pad 키보드는 iOS에 리턴키가 없어서, "다음" 버튼을 화면에 직접 둔다 */}
              {step === 1 && (
                <Pressable
                  onPress={handlePhoneSubmit}
                  disabled={!isPhoneValid}
                  hitSlop={8}
                  style={styles.nextButton}
                >
                  <Text style={[styles.nextButtonText, !isPhoneValid && styles.nextButtonTextDisabled]}>
                    다음 →
                  </Text>
                </Pressable>
              )}
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
  nextButton: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
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
