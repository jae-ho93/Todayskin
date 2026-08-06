import {
  getRequiredEnvKeys,
  validateProductionEnv,
  ENV_REGISTRY,
} from './env.registry';

describe('env.registry', () => {
  it('lists required keys for production', () => {
    const keys = getRequiredEnvKeys('production');
    expect(keys).toEqual(
      expect.arrayContaining([
        'NODE_ENV',
        'DATABASE_URL',
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
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
});
