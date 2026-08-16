import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useToast } from '../../src/components/Toast';
import { usePhoneVerification } from '../../src/features/auth/usePhoneVerification';
import { saveSession } from '../../src/lib/session';
import { colors, radius, spacing, typography } from '../../src/theme';

const validPhone = (value: string) => value.length === 11 && /^01[016789]/.test(value);
const displayPhone = (value: string) => value.length <= 3 ? value : value.length <= 7 ? `${value.slice(0, 3)}-${value.slice(3)}` : `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;

export default function SocialPhoneScreen() {
  const { showToast } = useToast();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // R27/F63: 문자 인증 상태 머신(발송→문자앱→복귀 자동 검증)을 훅으로 통일한다.
  // OTP 검증은 훅이 수행하고(onVerified), 여기서는 전화 연결 API만 호출한다.
  const phoneVerification = usePhoneVerification({
    purpose: 'social_link',
    onError: setError,
    onVerified: () => void linkPhone(),
  });

  const sendOtp = () => {
    if (!validPhone(phone) || phoneVerification.sending) return;
    void phoneVerification.sendCode(phone);
  };

  const linkPhone = async () => {
    if (submitting) return;
    setSubmitting(true); setError(null);
    try {
      const user = await api.socialLinkPhone(phone);
      await saveSession(user);
      // F59: 문자앱 복귀 자동 검증 완료 피드백
      showToast('휴대폰 인증이 완료됐어요', { type: 'success' });
      router.replace('/(tabs)');
    } catch (e) { setError(e instanceof Error ? e.message : '인증을 확인하지 못했어요. 다시 시도해주세요.'); }
    finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Text style={styles.headline}>전화번호를 연결할까요?</Text>
          <Text style={styles.subtitle}>계정 복구와 중요한 안내에 사용할 수 있어요. 지금 건너뛰어도 서비스 이용에는 문제가 없어요.</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>휴대폰 번호 (선택)</Text>
          <TextInput style={styles.input} keyboardType="number-pad" placeholder="010-1234-5678" placeholderTextColor={colors.gray300} value={displayPhone(phone)} onChangeText={(v) => { setPhone(v.replace(/\D/g, '').slice(0, 11)); phoneVerification.reset(); setError(null); }} editable={!phoneVerification.codeIssued} />
          <Pressable onPress={sendOtp} disabled={!validPhone(phone) || phoneVerification.sending} style={styles.textButton}><Text style={[styles.textButtonLabel, (!validPhone(phone) || phoneVerification.sending) && styles.muted]}>문자 인증 시작하기</Text></Pressable>
        </View>
        {phoneVerification.codeIssued && <View style={styles.field}>
          <Text style={styles.label}>인증 문자를 보내면 자동으로 확인돼요</Text>
          <Pressable onPress={() => void phoneVerification.openSms()} style={styles.smsButton}><Text style={styles.smsButtonText}>인증하기</Text></Pressable>
        </View>}
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.footer}>
          {phoneVerification.codeIssued && <Pressable onPress={() => { if (phoneVerification.verified) void linkPhone(); else void phoneVerification.verify(); }} disabled={phoneVerification.verifying || submitting} style={[styles.cta, (phoneVerification.verifying || submitting) && styles.ctaDisabled]}>{submitting || phoneVerification.verifying ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.ctaText}>인증 확인</Text>}</Pressable>}
          <Pressable onPress={() => router.replace('/(tabs)')} disabled={submitting} hitSlop={8}><Text style={styles.skip}>지금은 건너뛰기</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  body: { flex: 1, justifyContent: 'center', gap: spacing.xxl },
  header: { gap: spacing.sm },
  headline: { ...typography.displayLg, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary },
  field: { gap: spacing.sm },
  label: { ...typography.subtitle, color: colors.textSecondary },
  input: { borderBottomWidth: 2, borderBottomColor: colors.border, paddingVertical: spacing.md, fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  textButton: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
  textButtonLabel: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
  muted: { color: colors.gray300 },
  smsButton: { borderWidth: 1, borderColor: colors.sage, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  smsButtonText: { ...typography.subtitle, color: colors.sageDark, fontWeight: '700' },
  error: { ...typography.bodySm, color: colors.coralDark },
  footer: { gap: spacing.lg },
  cta: { minHeight: 54, borderRadius: radius.md, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { backgroundColor: colors.gray200 },
  ctaText: { ...typography.headline, color: colors.textInverse },
  skip: { ...typography.body, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
});
