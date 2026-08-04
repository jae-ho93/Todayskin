import { envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  const validBase = {
    NODE_ENV: 'development',
    PORT: 3000,
    ALLOWED_ORIGINS: 'http://localhost:8081',
  };

  it('accepts minimal valid env (T1 단계: DB/Redis/JWT optional)', () => {
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

  it('allows empty DATABASE_URL and REDIS_URL in T1', () => {
    const { error } = envValidationSchema.validate(
      { ...validBase, DATABASE_URL: '', REDIS_URL: '' },
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
