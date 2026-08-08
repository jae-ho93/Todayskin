import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import {
  JwksClient,
  verifyIdTokenWithJwks,
  type JwksKey,
} from './jwt-verify';
import { SocialProviderError } from './social-provider.interface';

/**
 * N33: RS256 id_token 검증기 단위 테스트.
 * 네트워크 없이 로컬 RSA 키페어로 서명한 토큰으로 서명·iss·aud·exp 검증을 확인한다.
 */
describe('verifyIdTokenWithJwks', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  // publicKey(DER)를 JWK 형식으로 변환한다.
  const jwk = (kid: string): JwksKey => {
    const jwkOut = createPublicKey({
      key: Buffer.from(publicKey),
      format: 'der',
      type: 'spki',
    }).export({ format: 'jwk' }) as { kty: string; n: string; e: string };
    return { kid, kty: jwkOut.kty, n: jwkOut.n, e: jwkOut.e };
  };

  const b64url = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  const makeToken = (over: {
    kid?: string;
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    email?: string;
  } = {}): string => {
    const kid = over.kid ?? 'test-key';
    const header = b64url({ alg: 'RS256', kid });
    const payload = b64url({
      iss: over.iss ?? 'https://issuer.example.com',
      aud: over.aud ?? 'client-123',
      sub: over.sub ?? 'user-1',
      exp: over.exp ?? Math.floor(Date.now() / 1000) + 3600,
      email: over.email ?? 'user@example.com',
    });
    const sig = sign(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      createPrivateKey({ key: Buffer.from(privateKey), format: 'der', type: 'pkcs8' }),
    ).toString('base64url');
    return `${header}.${payload}.${sig}`;
  };

  const options = {
    issuer: 'https://issuer.example.com',
    audience: 'client-123',
    getJwks: async () => [jwk('test-key')],
  };

  it('유효한 id_token을 검증하고 payload를 반환한다', async () => {
    const payload = await verifyIdTokenWithJwks(makeToken(), options);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('user@example.com');
  });

  it('서명이 위조된 토큰은 거부한다', async () => {
    const token = makeToken();
    // payload의 sub만 바꿔 서명이 깨지게 한다.
    const [h, , s] = token.split('.');
    const tampered = `${h}.${b64url({
      iss: 'https://issuer.example.com',
      aud: 'client-123',
      sub: 'attacker',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.${s}`;
    await expect(verifyIdTokenWithJwks(tampered, options)).rejects.toThrow(
      SocialProviderError,
    );
  });

  it('만료된 토큰은 거부한다', async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) - 10 });
    await expect(verifyIdTokenWithJwks(token, options)).rejects.toThrow(
      '만료',
    );
  });

  it('aud가 다르면(다른 앱용 토큰) 거부한다', async () => {
    const token = makeToken({ aud: 'other-app' });
    await expect(verifyIdTokenWithJwks(token, options)).rejects.toThrow(
      '대상 앱',
    );
  });

  it('iss가 다르면 거부한다', async () => {
    const token = makeToken({ iss: 'https://evil.example.com' });
    await expect(verifyIdTokenWithJwks(token, options)).rejects.toThrow(
      '발급자',
    );
  });

  it('미등록 kid(알 수 없는 서명 키)는 거부한다', async () => {
    const token = makeToken({ kid: 'unknown-key' });
    await expect(verifyIdTokenWithJwks(token, options)).rejects.toThrow(
      '서명 키를 찾을 수 없습니다',
    );
  });

  it('3부분 구조가 아닌 토큰은 거부한다', async () => {
    await expect(verifyIdTokenWithJwks('not.a.jwt', options)).rejects.toThrow(
      SocialProviderError,
    );
  });
});

describe('JwksClient', () => {
  it('JWKS를 조회·캐시한다 (같은 URL 재조회 없이 2번째 호출)', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          keys: [
            { kid: 'k1', kty: 'RSA', n: 'abc', e: 'AQAB', alg: 'RS256' },
          ],
        }),
      } as unknown as Response);

    const client = new JwksClient('https://jwks.example.com/certs', 60_000);
    const first = await client.getKeys();
    const second = await client.getKeys();
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('HTTP 오류 시 SocialProviderError를 던진다', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    const client = new JwksClient('https://jwks.example.com/certs');
    await expect(client.getKeys()).rejects.toThrow(SocialProviderError);
    fetchSpy.mockRestore();
  });
});
