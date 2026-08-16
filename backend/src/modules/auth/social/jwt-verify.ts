import { createPublicKey, verify } from 'node:crypto';
import { SocialProviderError } from './social-provider.interface';

/**
 * N33: id_token(RS256) 서명 검증 공용 모듈.
 *
 * Google/Apple은 모두 RS256 id_token을 발급하고 공개 JWKS로 서명을 검증한다.
 * 외부 라이브러리 없이 node:crypto(createPublicKey + verify)만 사용한다.
 * JWKS는 1시간 메모리 캐시한다 (토큰 검증 요청마다 네트워크 호출 방지).
 */

export interface JwksKey {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

export interface VerifiedIdToken {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  email?: string | null;
  name?: string | null;
  [key: string]: unknown;
}

/** 공개 JWKS 엔드포인트 조회 + 캐시. */
export class JwksClient {
  private cached: JwksKey[] | null = null;
  private cachedAt = 0;

  constructor(
    private readonly url: string,
    private readonly ttlMs = 60 * 60 * 1000,
  ) {}

  async getKeys(): Promise<JwksKey[]> {
    if (this.cached && Date.now() - this.cachedAt < this.ttlMs) {
      return this.cached;
    }
    let res: Response;
    try {
      res = await fetch(this.url, { signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw new SocialProviderError(
        `JWKS 조회 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok) {
      throw new SocialProviderError(`JWKS 조회 실패: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { keys?: JwksKey[] };
    const keys = data.keys ?? [];
    this.cached = keys;
    this.cachedAt = Date.now();
    return keys;
  }
}

/**
 * RS256 id_token 검증 — 구조(3부분)·alg·exp·iss·aud·서명 순서로 확인한다.
 * 검증 실패는 모두 SocialProviderError (401 매핑).
 */
export async function verifyIdTokenWithJwks(
  token: string,
  options: {
    issuer: string;
    /** 허용 aud 목록 — 클라이언트가 플랫폼별로 다른 client id를 쓰면 여러 개를 허용한다. */
    audiences: readonly string[];
    getJwks: () => Promise<JwksKey[]>;
  },
): Promise<VerifiedIdToken> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new SocialProviderError('id_token 형식이 올바르지 않습니다');
  }
  const [headerB64, payloadB64, sigB64] = parts;

  const header = decodeBase64UrlJson<{ kid?: string; alg?: string }>(headerB64);
  const payload = decodeBase64UrlJson<VerifiedIdToken>(payloadB64);

  if (!header.kid) {
    throw new SocialProviderError('id_token에 서명 키 식별자(kid)가 없습니다');
  }
  if (header.alg !== 'RS256') {
    throw new SocialProviderError(`지원하지 않는 id_token 알고리즘: ${header.alg}`);
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
    throw new SocialProviderError('id_token이 만료되었습니다');
  }
  if (payload.iss !== options.issuer) {
    throw new SocialProviderError('id_token 발급자가 일치하지 않습니다');
  }
  if (!options.audiences.includes(payload.aud)) {
    throw new SocialProviderError('id_token 대상 앱이 일치하지 않습니다');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new SocialProviderError('id_token에 사용자 식별자(sub)가 없습니다');
  }

  const jwks = await options.getJwks();
  const key = jwks.find((k) => k.kid === header.kid);
  if (!key) {
    throw new SocialProviderError('id_token 서명 키를 찾을 수 없습니다');
  }

  let publicKey;
  try {
    publicKey = createPublicKey({
      key: { kty: key.kty, n: key.n, e: key.e },
      format: 'jwk',
    });
  } catch {
    throw new SocialProviderError('id_token 서명 키가 올바르지 않습니다');
  }

  const valid = verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    publicKey,
    Buffer.from(sigB64, 'base64url'),
  );
  if (!valid) {
    throw new SocialProviderError('id_token 서명이 유효하지 않습니다');
  }
  return payload;
}

function decodeBase64UrlJson<T>(segment: string): T {
  try {
    const raw = Buffer.from(segment, 'base64url').toString('utf8');
    return JSON.parse(raw) as T;
  } catch {
    throw new SocialProviderError('id_token 페이로드가 올바르지 않습니다');
  }
}
