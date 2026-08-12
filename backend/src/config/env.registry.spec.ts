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
      MOCK_GEMINI: 'true',
    });
    expect(errors.some((e) => e.includes('MOCK_GEMINI'))).toBe(true);
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
