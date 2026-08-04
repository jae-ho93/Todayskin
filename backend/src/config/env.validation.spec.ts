import { envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  const validBase = {
    NODE_ENV: 'development',
    PORT: 3000,
    ALLOWED_ORIGINS: 'http://localhost:8081',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/todayskin',
    JWT_ACCESS_SECRET: 'test_access_secret_at_least_32_characters_long',
    JWT_REFRESH_SECRET: 'test_refresh_secret_at_least_32_characters_long',
  };

  it('accepts minimal valid env (T2 단계: DATABASE_URL required)', () => {
    const { error, value } = envValidationSchema.validate(validBase, {
      abortEarly: false,
      allowUnknown: true,
    });
    expect(error).toBeUndefined();
    expect(value.PORT).toBe(3000);
  });

  it('rejects invalid PORT', () => {
    const { error } = envValidationSchema.validate(
      { ...validBase, PORT: 99999 },
      { abortEarly: false, allowUnknown: true },
    );
    expect(error).toBeDefined();
    expect(error!.message).toContain('PORT');
  });

  it('rejects invalid NODE_ENV', () => {
    const { error } = envValidationSchema.validate(
      { ...validBase, NODE_ENV: 'staging' },
      { abortEarly: false, allowUnknown: true },
    );
    expect(error).toBeDefined();
  });

  it('requires DATABASE_URL in non-test environments', () => {
    const { error } = envValidationSchema.validate(
      { NODE_ENV: 'development', PORT: 3000, ALLOWED_ORIGINS: '' },
      { abortEarly: false, allowUnknown: true },
    );
    expect(error).toBeDefined();
    expect(error!.message).toContain('DATABASE_URL');
  });

  it('allows empty DATABASE_URL only in test environment', () => {
    const { error } = envValidationSchema.validate(
      { NODE_ENV: 'test', PORT: 3000, ALLOWED_ORIGINS: '', DATABASE_URL: '' },
      { abortEarly: false, allowUnknown: true },
    );
    expect(error).toBeUndefined();
  });

  it('requires JWT secrets (>=32 chars) in non-test environments', () => {
    const { error } = envValidationSchema.validate(
      { ...validBase, JWT_ACCESS_SECRET: 'short', JWT_REFRESH_SECRET: 'short' },
      { abortEarly: false, allowUnknown: true },
    );
    expect(error).toBeDefined();
    expect(error!.message).toContain('JWT_ACCESS_SECRET');
  });

  it('allows empty JWT secrets in test environment', () => {
    const { error } = envValidationSchema.validate(
      { NODE_ENV: 'test', PORT: 3000, ALLOWED_ORIGINS: '', DATABASE_URL: '', JWT_ACCESS_SECRET: '', JWT_REFRESH_SECRET: '' },
      { abortEarly: false, allowUnknown: true },
    );
    expect(error).toBeUndefined();
  });

  it('applies defaults for ACCESS_TOKEN_EXPIRES_IN and GEMINI_MODEL', () => {
    const { value } = envValidationSchema.validate(validBase, {
      abortEarly: false,
      allowUnknown: true,
    });
    expect(value.ACCESS_TOKEN_EXPIRES_IN).toBe('15m');
    expect(value.GEMINI_MODEL).toBe('gemini-flash-latest');
  });
});
