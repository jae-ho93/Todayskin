import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../types';

const SESSION_KEY = 'weatherskin.session.user';

// N18: refresh token 회전 실패(무효·만료) 등으로 세션이 정리될 때 화면 전환을 알리는 콜백.
// api client가 라우팅을 직접 몰라도 되도록 루트에서 구독한다.
type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

export function onSessionExpired(handler: SessionExpiredHandler): void {
  sessionExpiredHandler = handler;
}

export async function saveSession(user: User): Promise<void> {
  // 로그인 응답에는 Refresh Token도 포함되지만 앱은 아직 회전 흐름을 사용하지 않는다.
  // 응답 객체를 그대로 직렬화하면 타입에 선언되지 않은 토큰까지 AsyncStorage에 남으므로,
  // 현재 세션에 필요한 공개 사용자 필드와 Access Token만 명시적으로 저장한다.
  const session: User = {
    id: user.id,
    phoneNumber: user.phoneNumber,
    name: user.name,
    birthDate: user.birthDate,
    gender: user.gender,
    createdAt: user.createdAt,
    accessToken: user.accessToken,
    // N18: refresh 회전에 필요한 토큰/만료도 함께 저장한다.
    refreshToken: user.refreshToken,
    expiresIn: user.expiresIn,
  };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function getSession(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
  // 세션 만료(또는 로그아웃)를 구독자(루트 레이아웃)에 알려 로그인 화면으로 안내한다.
  sessionExpiredHandler?.();
}

export async function getToken(): Promise<string | null> {
  const user = await getSession();
  return user?.accessToken ?? null;
}

// N18: refresh 토큰 회전용.
export async function getRefreshToken(): Promise<string | null> {
  const user = await getSession();
  return user?.refreshToken ?? null;
}

/**
 * N18: refresh 성공 후 access token(및 새 refresh token)으로 세션을 갱신한다.
 * 나머지 사용자 필드는 그대로 유지한다.
 */
export async function updateTokens(
  accessToken: string,
  refreshToken?: string,
  expiresIn?: number,
): Promise<void> {
  const user = await getSession();
  if (!user) return;
  user.accessToken = accessToken;
  if (refreshToken) user.refreshToken = refreshToken;
  if (expiresIn !== undefined) user.expiresIn = expiresIn;
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
}
