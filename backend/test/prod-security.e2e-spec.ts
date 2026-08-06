import { envValidationSchema } from '../src/config/env.validation';

/**
 * N0: 운영 환경 보안 설정 강제 테스트.
 * envValidationSchema가 throttle 설정의 기본값과 허용 범위를 올바르게
 * 검증하는지, 운영에서 보안 설정이 누락되지 않는지 확인한다.
 */
describe('운영 보안 설정 (e2e)', () => {
  const prodBase = {
    NODE_ENV: 'production',
    PORT: 3000,
    ALLOWED_ORIGINS: 'https://app.todayskin.kr',
    DATABASE_URL: 'postgresql://user:pass@db:5432/todayskin',
    JWT_ACCESS_SECRET: 'prod_access_secret_at_least_32_characters_long',
    JWT_REFRESH_SECRET: 'prod_refresh_secret_at_least_32_characters_long',
    S3_BUCKET: 'todayskin-prod-images',
  };

  describe('Throttle 환경변수', () => {
    it('THROTTLE_LIMIT 기본값 60', () => {
      const { value } = envValidationSchema.validate(
        { ...prodBase },
        { abortEarly: false, allowUnknown: true },
      );
      expect(value.THROTTLE_LIMIT).toBe(60);
    });

    it('THROTTLE_TTL_MS 기본값 60000', () => {
      const { value } = envValidationSchema.validate(
        { ...prodBase },
        { abortEarly: false, allowUnknown: true },
      );
      expect(value.THROTTLE_TTL_MS).toBe(60_000);
    });

    it('THROTTLE_LIMIT 0 이하 거부', () => {
      const { error } = envValidationSchema.validate(
        { ...prodBase, THROTTLE_LIMIT: 0 },
        { abortEarly: false, allowUnknown: true },
      );
      expect(error).toBeDefined();
      expect(error!.message).toContain('THROTTLE_LIMIT');
    });

    it('THROTTLE_TTL_MS 100ms 미만 거부', () => {
      const { error } = envValidationSchema.validate(
        { ...prodBase, THROTTLE_TTL_MS: 50 },
        { abortEarly: false, allowUnknown: true },
      );
      expect(error).toBeDefined();
      expect(error!.message).toContain('THROTTLE_TTL_MS');
    });
  });
});
