import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../types';

const SESSION_KEY = 'weatherskin.session.user';

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
}

export async function getToken(): Promise<string | null> {
  const user = await getSession();
  return user?.accessToken ?? null;
}
