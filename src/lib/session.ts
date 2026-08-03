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

export async function getToken(): Promise<string | null> {
  const user = await getSession();
  return user?.accessToken ?? null;
}
