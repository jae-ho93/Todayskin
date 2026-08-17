import { Ionicons } from '@expo/vector-icons';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import type { SocialProvider } from '../types';

/**
 * 소셜 로그인 버튼.
 *
 * F93: 데모에서 동작하는 소셜 로그인은 Google뿐이지만, 화면 구성을 위해
 * Google을 첫 번째로 두고 카카오/Apple 버튼을 복원한다. 카카오(커스텀 스킴
 * 리다이렉트 거부로 보류)와 Apple(iOS 전용·클라이언트 미발급)은 아직
 * 동작하지 않으므로 누르면 "준비 중" 안내를 표시한다.
 *
 * F90/N66: Google은 공식 네이티브 SDK(@react-native-google-signin)를 쓴다.
 * Android 커스텀 스킴 redirect 금지 정책(2024~)으로 expo-auth-session의
 * 구글 provider는 더 이상 동작하지 않으며, SDK가 패키지명+SHA-1 서명으로
 * 앱을 검증하므로 커스텀 스킴 redirect가 필요 없다.
 */
type Props = {
  busyProvider: SocialProvider | null;
  onToken: (
    provider: SocialProvider,
    token: string,
    extra?: { nonce?: string },
  ) => Promise<void>;
  onError: (message: string | null) => void;
  /** true면 풀폭 텍스트 버튼 대신 아이콘 원형 48px (토스/배민 스타일) */
  compact?: boolean;
};

export function SocialLoginButtons({ busyProvider, onToken, onError, compact = false }: Props) {
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  // 구글은 플랫폼별 client id를 따로 쓴다 — 현재 플랫폼의 id가 있어야 버튼이 동작한다.
  // 다른 플랫폼 id만 있고 현재 플랫폼 id가 없으면 눌러도 실패하므로 "설정 안 됨" 안내로 빠진다.
  const googleConfigured =
    Platform.OS === 'ios'
      ? Boolean(googleIosClientId)
      : Platform.OS === 'android'
        ? Boolean(googleAndroidClientId)
        : Boolean(googleWebClientId);

  const handleGoogle = async () => {
    try {
      GoogleSignin.configure({
        // v16: androidClientId는 configure에 없다 — Android는 콘솔 클라이언트
        // (패키지+SHA-1)를 Play 서비스가 직접 검증한다. webClientId는 서버가
        // id_token의 aud를 검증할 때 쓴다 (백엔드 GOOGLE_CLIENT_ID 목록에 포함).
        webClientId: googleWebClientId ?? undefined,
        iosClientId: googleIosClientId ?? undefined,
        offlineAccess: false,
      });
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.type !== 'success') {
        onError('구글 로그인이 취소되었습니다.');
        return;
      }
      const idToken = response.data.idToken;
      if (!idToken) {
        onError('구글 인증 토큰을 확인하지 못했습니다.');
        return;
      }
      await onToken('google', idToken);
    } catch (error) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
          onError('구글 로그인이 취소되었습니다.');
          return;
        }
        if (error.code === statusCodes.IN_PROGRESS) return; // 이미 진행 중 — 무시
        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          onError('Google Play 서비스를 사용할 수 없어요.');
          return;
        }
      }
      onError('구글 인증에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // F93: 카카오/Apple은 아직 미지원 — 버튼은 노출하되 준비 중 안내만 한다.
  const showNotReady = (provider: string) => onError(`${provider} 로그인은 준비 중입니다.`);

  const disabled = busyProvider !== null;
  const googlePress = () =>
    googleConfigured ? void handleGoogle() : onError('Google 로그인 설정이 아직 연결되지 않았습니다. 앱 관리자에게 문의해주세요.');

  return (
    <View style={styles.container}>
      <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>소셜 계정으로 계속</Text><View style={styles.line} /></View>
      {compact ? (
        <View style={styles.iconRow}>
          <SocialIcon label="Google로 계속하기" background={colors.surface} color={colors.textPrimary} icon="logo-google" outlined loading={busyProvider === 'google'} disabled={disabled} onPress={googlePress} />
          <SocialIcon label="카카오로 계속하기" background="#FEE500" color="#191919" icon="chatbubble" loading={false} disabled={disabled} onPress={() => showNotReady('카카오')} />
          <SocialIcon label="Apple로 계속하기" background="#000000" color="#FFFFFF" icon="logo-apple" loading={false} disabled={disabled} onPress={() => showNotReady('Apple')} />
        </View>
      ) : (
        <>
          <SocialButton label="Google로 계속하기" background={colors.surface} color={colors.textPrimary} icon="logo-google" loading={busyProvider === 'google'} disabled={disabled} onPress={googlePress} />
          <SocialButton label="카카오로 계속하기" background="#FEE500" color="#191919" icon="chatbubble" loading={false} disabled={disabled} onPress={() => showNotReady('카카오')} />
          <SocialButton label="Apple로 계속하기" background="#000000" color="#FFFFFF" icon="logo-apple" loading={false} disabled={disabled} onPress={() => showNotReady('Apple')} />
        </>
      )}
      <Text style={styles.notice}>현재 Google 로그인만 지원합니다</Text>
    </View>
  );
}

function SocialIcon({ label, background, color, icon, outlined, loading, disabled, onPress }: { label: string; background: string; color: string; icon: keyof typeof Ionicons.glyphMap; outlined?: boolean; loading: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: background }, outlined && styles.outlined, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      {loading ? <ActivityIndicator color={color} /> : <Ionicons name={icon} size={22} color={color} />}
    </Pressable>
  );
}

function SocialButton({ label, background, color, icon, loading, disabled, onPress }: { label: string; background: string; color: string; icon: keyof typeof Ionicons.glyphMap; loading: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: background }, background === colors.surface && styles.outlined, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      {loading ? <ActivityIndicator color={color} /> : <><Ionicons name={icon} size={21} color={color} /><Text style={[styles.buttonText, { color }]}>{label}</Text></>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.xs },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { ...typography.caption, color: colors.textTertiary },
  notice: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
  button: { minHeight: 52, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  outlined: { borderWidth: 1, borderColor: colors.border },
  buttonText: { ...typography.subtitle, fontWeight: '700' },
  // 컴팩트: 아이콘 원형 48px — Apple HIG 최소 터치 타깃(44pt) 충족
  iconRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
});
