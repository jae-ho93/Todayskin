import * as Joi from 'joi';

/**
 * 환경변수 검증 스키마.
 * T2 단계: DATABASE_URL은 test 환경을 제외하고 required.
 * REDIS_URL은 캐시 장애 시에도 애플리케이션이 동작하도록 선택 사항이다.
 * JWT secret은 test 환경을 제외하고 required다.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  // CORS 허용 목록 — 쉼표로 구분 (예: http://localhost:8081,https://app.todayskin.kr)
  ALLOWED_ORIGINS: Joi.string().allow('').default(''),

  // T2에서 test 환경을 제외하고 required — PrismaModule이 인스턴스화되지 않을 수 있으므로.
  DATABASE_URL: Joi.when('NODE_ENV', {
    is: 'test',
    then: Joi.string().uri().allow('').optional(),
    otherwise: Joi.string().uri().required(),
  }),
  REDIS_URL: Joi.string().uri().allow('').optional(),
  // T12: 날씨 캐시 TTL(초). 기본 300초(5분) — 정부 API 분 단위 갱신 기준.
  WEATHER_CACHE_TTL_SECONDS: Joi.number().integer().min(0).default(300),

  // T3에서 required로 전환
  // T3: test 환경을 제외하고 JWT secret required.
  // secret은 최소 32자 이상 권장.
  JWT_ACCESS_SECRET: Joi.when('NODE_ENV', {
    is: 'test',
    then: Joi.string().allow('').optional(),
    otherwise: Joi.string().min(32).required(),
  }),
  JWT_REFRESH_SECRET: Joi.when('NODE_ENV', {
    is: 'test',
    then: Joi.string().allow('').optional(),
    otherwise: Joi.string().min(32).required(),
  }),
  ACCESS_TOKEN_EXPIRES_IN: Joi.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: Joi.string().default('14d'),

  // 외부 API 키 — T5+에서 사용
  KMA_API_KEY: Joi.string().allow('').optional(),
  AIRKOREA_API_KEY: Joi.string().allow('').optional(),
  // T5: 위치 권한 거부 또는 근접측정소 조회 실패 시 기본 지역 fallback.
  // 비워두면 REGIONS 기본값(서울 종로구)을 사용한다.
  KMA_AREA_NO: Joi.string().allow('').optional(),
  AIRKOREA_STATION_NAME: Joi.string().allow('').optional(),
  GEMINI_API_KEY: Joi.string().allow('').optional(),
  GEMINI_MODEL: Joi.string().default('gemini-flash-latest'),
  // T7/T8: 개발용 Gemini mock 응답. 운영에서는 반드시 false여야 함.
  // default를 두면 process.env 값을 덮어쓰는 경우가 있어 기본값을 생략한다.
  MOCK_GEMINI: Joi.string().valid('true', 'false').allow('').optional(),
  // T9: 개발/통합 테스트용 mock 진단 추론. 운영에서는 반드시 false여야 함.
  MOCK_INFERENCE: Joi.string().valid('true', 'false').allow('').optional(),

  // N0: Rate Limit 설정 — 분당 허용 요청 수와 TTL(ms).
  // 운영에서는 Redis 저장소 기반으로, 개발/테스트는 메모리 저장소로 동작.
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(60),
  THROTTLE_TTL_MS: Joi.number().integer().min(100).default(60_000),

  // N1: 구조화 로깅·관측성
  // 로그 레벨 — trace/debug/info/warn/error/fatal. 운영은 info, 개발은 debug 기본.
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),
  // Sentry DSN — 비워두면 Sentry 비활성화. 운영에서만 설정 권장.
  SENTRY_DSN: Joi.string().uri().allow('').optional(),
  // Sentry 트레이스 샘플링 비율 (0.0~1.0). 기본 0.1.
  SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).default(0.1),
});
