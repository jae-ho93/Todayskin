import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  clearSession,
  getRefreshToken,
  getSession,
  getToken,
  saveSession,
  updateTokens,
} from '../session';
import type { User } from '../../types';

const SESSION_KEY = 'weatherskin.session.user';
const TOKENS_KEY = 'weatherskin.session.tokens';

// jest.setup.js의 인메모리 목 저장소.
const asyncStore = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;
const secureStore = (SecureStore as unknown as { __store: Map<string, string> }).__store;

const user: User = {
  id: 1,
  phoneNumber: '01012345678',
  name: '테스터',
  birthDate: '1990-01-01',
  gender: 'female',
  createdAt: '2026-01-01T00:00:00.000Z',
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
};

beforeEach(() => {
  asyncStore.clear();
  secureStore.clear();
});

describe('session 저장소 (R1)', () => {
  it('토큰은 SecureStore에만, 프로필은 AsyncStorage에 저장한다', async () => {
    await saveSession(user);

    const profileRaw = asyncStore.get(SESSION_KEY) as string;
    expect(profileRaw).toBeDefined();
    expect(profileRaw).not.toContain('access-1');
    expect(profileRaw).not.toContain('refresh-1');
    expect(asyncStore.has(TOKENS_KEY)).toBe(false);

    expect(JSON.parse(secureStore.get(TOKENS_KEY) as string)).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 900,
    });
  });

  it('선언되지 않은 응답 필드는 프로필에 저장하지 않는다', async () => {
    await saveSession({ ...user, isNewUser: true } as User & { isNewUser: boolean });

    expect(JSON.parse(asyncStore.get(SESSION_KEY) as string)).toEqual({
      id: user.id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      birthDate: user.birthDate,
      gender: user.gender,
      createdAt: user.createdAt,
    });
  });

  it('저장한 세션을 프로필+토큰으로 합쳐 돌려준다', async () => {
    await saveSession(user);

    await expect(getSession()).resolves.toEqual(user);
    await expect(getToken()).resolves.toBe('access-1');
    await expect(getRefreshToken()).resolves.toBe('refresh-1');
  });

  it('세션이 없으면 null을 반환한다', async () => {
    await expect(getSession()).resolves.toBeNull();
    await expect(getToken()).resolves.toBeNull();
  });

  it('SecureStore 읽기가 실패하면 토큰 없이(재로그인 유도) 반환한다', async () => {
    await saveSession(user);
    jest
      .spyOn(SecureStore, 'getItemAsync')
      .mockRejectedValueOnce(new Error('keychain unavailable'));

    const session = await getSession();

    expect(session?.id).toBe(1);
    expect(session?.accessToken).toBeUndefined();
  });

  it('clearSession은 프로필과 토큰을 모두 지운다', async () => {
    await saveSession(user);

    await clearSession();

    expect(asyncStore.size).toBe(0);
    expect(secureStore.size).toBe(0);
  });

  it('updateTokens는 새 access token을 저장하고 나머지는 유지한다', async () => {
    await saveSession(user);

    await updateTokens('access-2');

    await expect(getSession()).resolves.toEqual({
      ...user,
      accessToken: 'access-2',
    });
  });

  it('세션이 없으면 updateTokens는 아무것도 저장하지 않는다', async () => {
    await updateTokens('access-2');

    expect(secureStore.size).toBe(0);
  });
});

describe('레거시 토큰 마이그레이션 (R1)', () => {
  /** R1 이전 버전이 남긴 상태 — 프로필과 토큰이 함께 AsyncStorage 평문에 있다. */
  function seedLegacySession(): void {
    asyncStore.set(SESSION_KEY, JSON.stringify(user));
  }

  it('AsyncStorage 평문 토큰을 SecureStore로 옮기고 원본에서 지운다', async () => {
    seedLegacySession();

    const session = await getSession();

    expect(session).toEqual(user);
    expect(asyncStore.get(SESSION_KEY)).not.toContain('access-1');
    expect(JSON.parse(secureStore.get(TOKENS_KEY) as string)).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 900,
    });
  });

  it('두 번째 조회는 이미 이관된 SecureStore 토큰을 쓴다', async () => {
    seedLegacySession();
    await getSession();
    const setItemAsync = SecureStore.setItemAsync as jest.Mock;
    setItemAsync.mockClear();

    await expect(getSession()).resolves.toEqual(user);
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it('이관 실패 시 세션을 정리하고 null을 반환한다 (조용한 로그아웃)', async () => {
    seedLegacySession();
    jest
      .spyOn(SecureStore, 'setItemAsync')
      .mockRejectedValueOnce(new Error('keychain unavailable'));

    await expect(getSession()).resolves.toBeNull();
    expect(asyncStore.size).toBe(0);
  });
});
