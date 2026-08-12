import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AppleSocialProvider } from './apple.social-provider';

/**
 * N46: Apple nonce 검증 단위 테스트.
 * 로컬 RSA 키페어로 서명한 identity token으로 nonce 일치/불일치/누락을 확인한다.
 * (서명·iss·aud·exp 검증 자체는 jwt-verify.spec.ts가 커버)
 */
describe('AppleSocialProvider (nonce, N46)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  const jwk = () => {
    const out = createPublicKey({
      key: Buffer.from(publicKey),
      format: 'der',
      type: 'spki',
    }).export({ format: 'jwk' }) as { kty: string; n: string; e: string };
    return { kid: 'apple-key', kty: out.kty, n: out.n, e: out.e };
  };

  const b64url = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  const makeToken = (claims: Record<string, unknown> = {}): string => {
    const header = b64url({ alg: 'RS256', kid: 'apple-key' });
    const payload = b64url({
      iss: 'https://appleid.apple.com',
      aud: 'com.todayskin.app',
      sub: 'apple-user-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    });
    const sig = sign(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      createPrivateKey({
        key: Buffer.from(privateKey),
        format: 'der',
        type: 'pkcs8',
      }),
    ).toString('base64url');
    return `${header}.${payload}.${sig}`;
  };

  const config = {
    get: jest.fn((key: string) =>
      key === 'APPLE_BUNDLE_ID' ? 'com.todayskin.app' : undefined,
    ),
  } as unknown as ConfigService;

  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    // JWKS 조회를 로컬 키로 대체한다.
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [jwk()] }),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('nonce 클레임이 원문과 일치하면 통과한다', async () => {
    const provider = new AppleSocialProvider(config);
    const token = makeToken({ nonce: 'raw-nonce-1' });

    const profile = await provider.verify(token, { nonce: 'raw-nonce-1' });
    expect(profile.providerUserId).toBe('apple-user-1');
  });

  it('nonce 클레임이 SHA-256(hex)로 해시돼 있어도 통과한다 (expo 동작)', async () => {
    const provider = new AppleSocialProvider(config);
    const hashed = createHash('sha256').update('raw-nonce-2').digest('hex');
    const token = makeToken({ nonce: hashed });

    const profile = await provider.verify(token, { nonce: 'raw-nonce-2' });
    expect(profile.providerUserId).toBe('apple-user-1');
  });

  it('nonce가 일치하지 않으면(리플레이 의심) 거부한다', async () => {
    const provider = new AppleSocialProvider(config);
    const token = makeToken({ nonce: 'someone-elses-nonce' });

    await expect(
      provider.verify(token, { nonce: 'my-nonce' }),
    ).rejects.toThrow('애플 로그인 nonce가 일치하지 않습니다');
  });

  it('요청에 nonce가 없으면 토큰 검증 전에 거부한다 (fail-closed)', async () => {
    const provider = new AppleSocialProvider(config);

    await expect(provider.verify(makeToken())).rejects.toThrow(
      '애플 로그인 요청에 nonce가 없습니다',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('토큰에 nonce 클레임이 없으면 거부한다', async () => {
    const provider = new AppleSocialProvider(config);

    await expect(
      provider.verify(makeToken(), { nonce: 'my-nonce' }),
    ).rejects.toThrow('애플 identity token에 nonce가 없습니다');
  });
});
