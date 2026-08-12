import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import type { SocialProvider } from '../types';

WebBrowser.maybeCompleteAuthSession();

const redirectUri = AuthSession.makeRedirectUri({ scheme: 'weatherskin', path: 'oauth' });
const kakaoDiscovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://kauth.kakao.com/oauth/authorize',
  tokenEndpoint: 'https://kauth.kakao.com/oauth/token',
};

type Props = {
  busyProvider: SocialProvider | null;
  /** N46: apple은 리플레이 방지 nonce를 extra로 함께 넘긴다. */
  onToken: (
    provider: SocialProvider,
    token: string,
    extra?: { nonce?: string },
  ) => Promise<void>;
  onError: (message: string | null) => void;
  /** true면 풀폭 텍스트 버튼 대신 아이콘 원형 48px 3개 (토스/배민 스타일) */
  compact?: boolean;
};

export function SocialLoginButtons({ busyProvider, onToken, onError, compact = false }: Props) {
  const kakaoClientId = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  const [kakaoRequest, kakaoResponse, promptKakao] = AuthSession.useAuthRequest(
    {
      clientId: kakaoClientId ?? 'not-configured',
      redirectUri,
      scopes: ['profile_nickname', 'account_email'],
      usePKCE: true,
    },
    kakaoDiscovery,
  );
  const [, googleResponse, promptGoogle] = Google.useAuthRequest(
    {
      iosClientId: googleIosClientId ?? 'not-configured',
      androidClientId: googleAndroidClientId ?? 'not-configured',
      webClientId: googleWebClientId ?? 'not-configured',
      scopes: ['openid', 'profile', 'email'],
    },
    { scheme: 'weatherskin', path: 'oauth' },
  );

  useEffect(() => {
    if (!kakaoResponse) return;
    if (kakaoResponse.type === 'cancel' || kakaoResponse.type === 'dismiss') {
      onError('카카오 로그인이 취소되었습니다.');
      return;
    }
    if (kakaoResponse.type !== 'success' || !kakaoResponse.params.code || !kakaoClientId || !kakaoRequest) {
      if (kakaoResponse.type === 'error') onError('카카오 인증에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    AuthSession.exchangeCodeAsync(
      {
        clientId: kakaoClientId,
        code: kakaoResponse.params.code,
        redirectUri,
        extraParams: { code_verifier: kakaoRequest.codeVerifier ?? '' },
      },
      kakaoDiscovery,
    )
      .then((result) => onToken('kakao', result.accessToken))
      .catch(() => onError('카카오 인증 토큰을 확인하지 못했습니다.'));
  }, [kakaoClientId, kakaoRequest, kakaoResponse, onError, onToken]);

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === 'cancel' || googleResponse.type === 'dismiss') {
      onError('구글 로그인이 취소되었습니다.');
      return;
    }
    if (googleResponse.type !== 'success') {
      if (googleResponse.type === 'error') onError('구글 인증에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    const idToken = googleResponse.params.id_token ?? googleResponse.authentication?.idToken;
    if (!idToken) {
      onError('구글 인증 토큰을 확인하지 못했습니다.');
      return;
    }
    void onToken('google', idToken);
  }, [googleResponse, onError, onToken]);

  const showNotConfigured = (provider: string) =>
    onError(`${provider} 로그인 설정이 아직 연결되지 않았습니다. 앱 관리자에게 문의해주세요.`);

  const handleApple = async () => {
    if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
      showNotConfigured('Apple');
      return;
    }
    try {
      // N46: 요청마다 임의 nonce를 만들어 리플레이를 막는다.
      // id_token의 nonce 클레임과 서버에 보내는 원문이 대조된다.
      const nonce = Crypto.randomUUID();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
      if (!credential.identityToken) throw new Error('missing identity token');
      await onToken('apple', credential.identityToken, { nonce });
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
        onError('Apple 로그인이 취소되었습니다.');
      } else {
        onError('Apple 인증에 실패했습니다. 다시 시도해주세요.');
      }
    }
  };

  const disabled = busyProvider !== null;
  if (compact) {
    return (
      <View style={styles.container}>
        <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>소셜 계정으로 계속</Text><View style={styles.line} /></View>
        <View style={styles.iconRow}>
          <SocialIcon label="카카오로 계속하기" background="#FEE500" color="#191919" icon="chatbubble" loading={busyProvider === 'kakao'} disabled={disabled} onPress={() => kakaoClientId ? promptKakao() : showNotConfigured('카카오')} />
          <SocialIcon label="Google로 계속하기" background={colors.surface} color={colors.textPrimary} icon="logo-google" outlined loading={busyProvider === 'google'} disabled={disabled} onPress={() => (googleIosClientId || googleAndroidClientId || googleWebClientId) ? promptGoogle() : showNotConfigured('Google')} />
          <SocialIcon label="Apple로 계속하기" background="#000000" color="#FFFFFF" icon="logo-apple" loading={busyProvider === 'apple'} disabled={disabled} onPress={handleApple} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>소셜 계정으로 계속</Text><View style={styles.line} /></View>
      <SocialButton label="카카오로 계속하기" background="#FEE500" color="#191919" icon="chatbubble" loading={busyProvider === 'kakao'} disabled={disabled} onPress={() => kakaoClientId ? promptKakao() : showNotConfigured('카카오')} />
      <SocialButton label="Google로 계속하기" background={colors.surface} color={colors.textPrimary} icon="logo-google" loading={busyProvider === 'google'} disabled={disabled} onPress={() => (googleIosClientId || googleAndroidClientId || googleWebClientId) ? promptGoogle() : showNotConfigured('Google')} />
      <SocialButton label="Apple로 계속하기" background="#000000" color="#FFFFFF" icon="logo-apple" loading={busyProvider === 'apple'} disabled={disabled} onPress={handleApple} />
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
