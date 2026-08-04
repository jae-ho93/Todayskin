import * as Joi from 'joi';

/**
 * 환경변수 검증 스키마.
 * T1 단계에서는 DB/Redis 없이 실행 가능해야 하므로 DATABASE_URL, REDIS_URL은 optional.
 * 운영 전환(T2/T3) 시 required로 강화 예정.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  // CORS 허용 목록 — 쉼표로 구분 (예: http://localhost:8081,https://app.todayskin.kr)
  ALLOWED_ORIGINS: Joi.string().allow('').default(''),

  // T1 단계에서는 optional — T2에서 required로 전환
  DATABASE_URL: Joi.string().uri().allow('').optional(),
  REDIS_URL: Joi.string().uri().allow('').optional(),

  // T3에서 required로 전환
  JWT_ACCESS_SECRET: Joi.string().allow('').optional(),
  JWT_REFRESH_SECRET: Joi.string().allow('').optional(),
  ACCESS_TOKEN_EXPIRES_IN: Joi.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: Joi.string().default('14d'),

  // 외부 API 키 — T5+에서 사용
  KMA_API_KEY: Joi.string().allow('').optional(),
  AIRKOREA_API_KEY: Joi.string().allow('').optional(),
  GEMINI_API_KEY: Joi.string().allow('').optional(),
  GEMINI_MODEL: Joi.string().default('gemini-flash-latest'),
});
