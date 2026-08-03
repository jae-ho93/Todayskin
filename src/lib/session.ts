import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../types';

const SESSION_KEY = 'weatherskin.session.user';

export async function saveSession(user: User): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
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

// 아직 피부 스냅샷을 서버 DB에 저장하지 않아서(추후 연동 예정), 기기 로컬 기준으로
// "이 유저가 한 번이라도 촬영했는지"를 추적한다. 신규 가입 직후엔 당연히 false.
function capturedKey(userId: number): string {
  return `weatherskin.hasCapturedSkin.${userId}`;
}

export async function getHasCapturedSkin(userId: number): Promise<boolean> {
  const raw = await AsyncStorage.getItem(capturedKey(userId));
  return raw === 'true';
}

export async function setHasCapturedSkin(userId: number): Promise<void> {
  await AsyncStorage.setItem(capturedKey(userId), 'true');
}
