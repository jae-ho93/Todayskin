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

  it('applies defaults for ACCESS_TOKEN_EXPIRES_IN and OPENAI_MODEL', () => {
    const { value } = envValidationSchema.validate(validBase, {
      abortEarly: false,
      allowUnknown: true,
    });
    expect(value.ACCESS_TOKEN_EXPIRES_IN).toBe('15m');
    expect(value.OPENAI_MODEL).toBe('gpt-4o-mini');
  });

  // R18: registry에만 있고 Joi 규칙이 없던 키들에 규칙이 생기면서 실제 운영 값이
  // 새 규칙에 걸려 부팅이 실패하는 것이 이 변경의 유일한 실질 위험이다.
  // 운영 task definition과 같은 모양의 env가 통과하는지 고정한다.
  it('운영 task definition 형태의 env가 통과한다', () => {
    const { error } = envValidationSchema.validate(
      {
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://user:pass@db.internal:5432/todayskin',
        SHADOW_DATABASE_URL: 'postgresql://user:pass@db.internal:5432/todayskin_shadow',
        REDIS_URL: 'redis://cache.internal:6379',
        JWT_ACCESS_SECRET: 'prod_access_secret_at_least_32_characters',
        JWT_REFRESH_SECRET: 'prod_refresh_secret_at_least_32_characters',
        S3_BUCKET: 'todayskin-prod-images',
        AWS_REGION: 'ap-northeast-2',
        INFERENCE_SERVICE_URL: 'http://inference.todayskin.local:8000',
        INFERENCE_SHARED_SECRET: 'shared-secret',
        OCTOMO_API_KEY: 'octomo-key',
        OCTOMO_ENDPOINT: 'https://api.octoverse.kr/octomo/v1/public/message/exists',
        OCTOMO_RECIPIENT_NUMBER: '1666-3538',
        GOOGLE_CLIENT_ID: '1234.apps.googleusercontent.com',
        APPLE_BUNDLE_ID: 'kr.todayskin.app',
        PUSH_DELIVERY_AVAILABLE: 'false',
        RUN_MIGRATIONS_ON_START: 'false',
        WEATHER_COLLECTOR_ENABLED: 'true',
        SENTRY_DSN: 'https://key@o0.ingest.sentry.io/1',
        LOG_LEVEL: 'info',
      },
      { abortEarly: false, allowUnknown: true },
    );
    expect(error).toBeUndefined();
  });

  it('T12: WEATHER_CACHE_TTL_SECONDS 기본값은 300', () => {
    const { value } = envValidationSchema.validate(validBase, {
      abortEarly: false,
      allowUnknown: true,
    });
    expect(value.WEATHER_CACHE_TTL_SECONDS).toBe(300);
  });
});
