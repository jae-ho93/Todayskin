import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { saveSession } from '../../src/lib/session';
import { colors, radius, spacing, typography } from '../../src/theme';

const validPhone = (value: string) => value.length === 11 && /^01[016789]/.test(value);
const displayPhone = (value: string) => value.length <= 3 ? value : value.length <= 7 ? `${value.slice(0, 3)}-${value.slice(3)}` : `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;

export default function SocialPhoneScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    if (!validPhone(phone) || busy) return;
    setBusy(true); setError(null);
    try { await api.sendOtp(phone, 'social_link'); setSent(true); }
    catch (e) { setError(e instanceof Error ? e.message : '인증번호를 보내지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const linkPhone = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true); setError(null);
    try {
      await api.verifyOtp(phone, code, 'social_link');
      const user = await api.socialLinkPhone(phone);
      await saveSession(user);
      router.replace('/(tabs)');
    } catch (e) { setError(e instanceof Error ? e.message : '전화번호를 연결하지 못했습니다.'); }
    finally { setBusy(false); }
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
          <TextInput style={styles.input} keyboardType="number-pad" placeholder="010-1234-5678" placeholderTextColor={colors.gray300} value={displayPhone(phone)} onChangeText={(v) => { setPhone(v.replace(/\D/g, '').slice(0, 11)); setSent(false); setCode(''); setError(null); }} editable={!sent} />
          <Pressable onPress={sendOtp} disabled={!validPhone(phone) || busy} style={styles.textButton}><Text style={[styles.textButtonLabel, (!validPhone(phone) || busy) && styles.muted]}>인증번호 받기</Text></Pressable>
        </View>
        {sent && <View style={styles.field}>
          <Text style={styles.label}>인증번호</Text>
          <TextInput style={styles.input} keyboardType="number-pad" placeholder="6자리 숫자" placeholderTextColor={colors.gray300} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} maxLength={6} autoFocus />
        </View>}
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.footer}>
          {sent && <Pressable onPress={linkPhone} disabled={code.length !== 6 || busy} style={[styles.cta, (code.length !== 6 || busy) && styles.ctaDisabled]}>{busy ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.ctaText}>연결하고 시작하기</Text>}</Pressable>}
          <Pressable onPress={() => router.replace('/(tabs)')} disabled={busy} hitSlop={8}><Text style={styles.skip}>지금은 건너뛰기</Text></Pressable>
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
  error: { ...typography.bodySm, color: colors.coralDark },
  footer: { gap: spacing.lg },
  cta: { minHeight: 54, borderRadius: radius.md, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { backgroundColor: colors.gray200 },
  ctaText: { ...typography.headline, color: colors.textInverse },
  skip: { ...typography.body, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
});
