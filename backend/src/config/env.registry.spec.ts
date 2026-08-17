import {
  getRequiredEnvKeys,
  validateProductionEnv,
  ENV_REGISTRY,
} from './env.registry';
import { envValidationSchema } from './env.validation';

describe('env.registry', () => {
  it('lists required keys for production', () => {
    const keys = getRequiredEnvKeys('production');
    expect(keys).toEqual(
      expect.arrayContaining([
        'NODE_ENV',
        'DATABASE_URL',
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
        'S3_BUCKET',
      ]),
    );
  });

  it('rejects truthy mock flags in production', () => {
    const errors = validateProductionEnv({
      NODE_ENV: 'production',
      MOCK_OPENAI: 'true',
    });
    expect(errors.some((e) => e.includes('MOCK_OPENAI'))).toBe(true);
  });

  // N66: 데모 기간 한정(allowProductionUntil) production 허용 — 데모 이후 자동 복귀.
  it('allows OTP_ALLOWLIST_PHONES in production until allowProductionUntil (N66)', () => {
    const def = ENV_REGISTRY.find((d) => d.key === 'OTP_ALLOWLIST_PHONES')!;
    expect(def.allowProductionUntil).toBeTruthy();
    expect(new Date(def.allowProductionUntil!).getTime()).toBeGreaterThan(Date.now());

    const errors = validateProductionEnv({
      NODE_ENV: 'production',
      OTP_ALLOWLIST_PHONES: '01000000000',
    });
    expect(errors.some((e) => e.includes('OTP_ALLOWLIST_PHONES'))).toBe(false);
  });

  it('rejects OTP_ALLOWLIST_PHONES after allowProductionUntil passes (N66)', () => {
    const def = ENV_REGISTRY.find((d) => d.key === 'OTP_ALLOWLIST_PHONES')!;
    const orig = def.allowProductionUntil;
    // 만료 시나리오: allowProductionUntil이 과거면 기존 production 금지 정책으로 복귀.
    (def as { allowProductionUntil?: string }).allowProductionUntil = '2020-01-01';
    try {
      const expired = validateProductionEnv({
        NODE_ENV: 'production',
        OTP_ALLOWLIST_PHONES: '01000000000',
      });
      expect(expired.some((e) => e.includes('OTP_ALLOWLIST_PHONES'))).toBe(true);
    } finally {
      (def as { allowProductionUntil?: string }).allowProductionUntil = orig;
    }
  });

  it('rejects unknown keys when APP_ENV_KEYS declared', () => {
    const errors = validateProductionEnv({
      NODE_ENV: 'production',
      APP_ENV_KEYS: 'DATABASE_URL,NOT_A_REAL_KEY',
    });
    expect(errors.some((e) => e.includes('NOT_A_REAL_KEY'))).toBe(true);
  });

  it('every mock flag has owner and expiry', () => {
    for (const d of ENV_REGISTRY.filter((x) => x.mockFlag)) {
      expect(d.owner).toBeTruthy();
      expect(d.expiry).toBeTruthy();
    }
  });

  // R18: 검증 스키마는 registry에서 조립된다. 아래 두 테스트가 통과하는 한
  // "registry에는 있는데 Joi 규칙이 없는 키"(검증 우회)가 다시 생길 수 없다.
  describe('registry ↔ Joi 스키마 (R18)', () => {
    const schemaKeys = new Set(
      Object.keys((envValidationSchema.describe().keys ?? {}) as Record<string, unknown>),
    );

    it('키 집합이 정확히 일치한다', () => {
      expect([...schemaKeys].sort()).toEqual(ENV_REGISTRY.map((d) => d.key).sort());
    });

    it('모든 항목에 Joi 규칙이 있다', () => {
      for (const d of ENV_REGISTRY) {
        expect(typeof d.schema?.validate).toBe('function');
      }
    });

    it('키가 중복 등록되지 않는다', () => {
      const keys = ENV_REGISTRY.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('secret에는 실제 값이 기본값으로 박혀 있지 않다 (빈 값만 허용)', () => {
      for (const d of ENV_REGISTRY.filter((x) => x.secret)) {
        expect(String(d.safeDefault ?? '')).toBe('');
      }
    });
  });
});
