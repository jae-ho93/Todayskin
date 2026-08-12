import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { User } from '../types';

/**
 * 세션 저장소.
 *
 * R1: 토큰은 AsyncStorage(iOS 평문 파일 / Android 평문 SQLite)에 두지 않고
 * SecureStore(iOS Keychain / Android Keystore)에 저장한다. refresh 토큰 수명이
 * 14일이므로 평문 저장 시 기기 분실·ADB 백업·루팅 단말에서 공격 창이 2주가 된다.
 * 민감하지 않은 프로필 값은 그대로 AsyncStorage에 남긴다(마이그레이션 비용 없음).
 *
 * 함수 시그니처는 그대로이므로 호출부는 변경되지 않는다.
 */

const SESSION_KEY = 'weatherskin.session.user';
// SecureStore 키는 영문·숫자·`.`·`-`·`_`만 허용된다.
const TOKENS_KEY = 'weatherskin.session.tokens';

interface SessionTokens {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

/** 프로필(비민감) — AsyncStorage에 저장되는 부분. */
type StoredProfile = Omit<User, 'accessToken' | 'refreshToken' | 'expiresIn'>;

// N18: refresh token 회전 실패(무효·만료) 등으로 세션이 정리될 때 화면 전환을 알리는 콜백.
// api client가 라우팅을 직접 몰라도 되도록 루트에서 구독한다.
type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

export function onSessionExpired(handler: SessionExpiredHandler): void {
  sessionExpiredHandler = handler;
}

/**
 * SecureStore는 네이티브 전용이다. web(expo start --web)에서는 사용할 수 없으므로
 * AsyncStorage로 폴백한다 — 브라우저에는 Keychain에 상응하는 저장소가 없다.
 */
const secureStoreAvailable = Platform.OS !== 'web';

async function writeTokens(tokens: SessionTokens): Promise<void> {
  const raw = JSON.stringify(tokens);
  if (!secureStoreAvailable) {
    await AsyncStorage.setItem(TOKENS_KEY, raw);
    return;
  }
  // SecureStore는 값 크기 제한(약 2KB)이 있어 토큰만 저장한다.
  await SecureStore.setItemAsync(TOKENS_KEY, raw);
}

async function readTokens(): Promise<SessionTokens> {
  try {
    const raw = secureStoreAvailable
      ? await SecureStore.getItemAsync(TOKENS_KEY)
      : await AsyncStorage.getItem(TOKENS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SessionTokens;
  } catch {
    // 읽기·복호화 실패는 "토큰 없음"으로 취급한다 — 호출부가 재로그인을 유도한다.
    return {};
  }
}

async function removeTokens(): Promise<void> {
  try {
    if (secureStoreAvailable) {
      await SecureStore.deleteItemAsync(TOKENS_KEY);
    } else {
      await AsyncStorage.removeItem(TOKENS_KEY);
    }
  } catch {
    // 삭제 실패도 세션 정리를 막지 않는다.
  }
}

/**
 * 로그인 응답에는 타입에 선언되지 않은 필드(예: isNewUser)도 섞여 오므로,
 * 저장할 비민감 필드만 명시적으로 골라낸다.
 */
function toProfile(user: User): StoredProfile {
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    name: user.name,
    birthDate: user.birthDate,
    gender: user.gender,
    createdAt: user.createdAt,
  };
}

export async function saveSession(user: User): Promise<void> {
  await writeTokens({
    accessToken: user.accessToken,
    refreshToken: user.refreshToken,
    expiresIn: user.expiresIn,
  });
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(toProfile(user)));
}

export async function getSession(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  let stored: User;
  try {
    stored = JSON.parse(raw) as User;
  } catch {
    return null;
  }

  // R1 1회성 마이그레이션: 예전 버전이 AsyncStorage에 평문으로 남긴 토큰을
  // SecureStore로 옮기고 원본에서 지운다. 실패하면 토큰 없이 진행해
  // (조용한 로그아웃) 앱이 깨지지 않게 한다.
  if (stored.accessToken || stored.refreshToken) {
    const migrated = await migrateLegacyTokens(stored);
    if (!migrated) return null;
    return stored;
  }

  const tokens = await readTokens();
  // 토큰이 없을 수도 있다(SecureStore 초기화·복호화 실패). 호출부는 이미
  // accessToken 부재를 "로그인 필요"로 처리한다.
  return { ...stored, ...tokens } as User;
}

/** 반환값 false면 마이그레이션 실패 — 세션을 정리했으므로 재로그인이 필요하다. */
async function migrateLegacyTokens(stored: User): Promise<boolean> {
  try {
    await writeTokens({
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      expiresIn: stored.expiresIn,
    });
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(toProfile(stored)));
    return true;
  } catch {
    await clearSession();
    return false;
  }
}

export async function clearSession(): Promise<void> {
  await removeTokens();
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
  await writeTokens({
    accessToken,
    refreshToken: refreshToken ?? user.refreshToken,
    expiresIn: expiresIn ?? user.expiresIn,
  });
}
