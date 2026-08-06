import * as Joi from 'joi';
import { validateProductionEnv } from './env.registry';

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
  REDIS_URL: Joi.when('JOB_DISPATCHER', {
    is: 'bullmq',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().allow('').optional(),
  }),
  // T12: 날씨 캐시 TTL(초). 기본 300초(5분) — 정부 API 분 단위 갱신 기준.
  WEATHER_CACHE_TTL_SECONDS: Joi.number().integer().min(0).default(300),
  // N4: Job dispatcher. auto=REDIS_URL 있으면 BullMQ, 없으면 Inline.
  // inline은 테스트/로컬에서 Redis 없이 동일 PENDING→COMPLETED 계약 유지.
  JOB_DISPATCHER: Joi.string().valid('auto', 'inline', 'bullmq').default('auto'),

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

  // N2: OTP 인증 — 가입·새 디바이스 로그인에 OTP 필수 (운영 공개 전)
  // OTP_TTL_SECONDS: 코드 유효 시간. 기본 180초(3분).
  OTP_TTL_SECONDS: Joi.number().integer().min(10).default(180),
  // OTP_MAX_ATTEMPTS: 최대 검증 시도 횟수. 기본 5.
  OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
  // OTP_RESEND_COOLDOWN_SECONDS: 재전송 대기 시간. 기본 60초.
  OTP_RESEND_COOLDOWN_SECONDS: Joi.number().integer().min(0).default(60),
  // OTP_MAX_PENDING_PER_PHONE: 번호별 미검증 코드 최대 개수. 기본 3.
  OTP_MAX_PENDING_PER_PHONE: Joi.number().integer().min(1).default(3),
  // 개발용 고정 OTP를 허용할 테스트 전화번호 (쉼표 구분, 하이픈 제거).
  // 운영에서는 비활성화. 예: 01012345678,01099999999
  OTP_ALLOWLIST_PHONES: Joi.string().allow('').default(''),

  // N2: SMS 게이트웨이 (운영용 SmsOtpProvider). 운영 공개 전 구현.
  SMS_API_KEY: Joi.string().allow('').optional(),
  SMS_SENDER: Joi.string().allow('').optional(),
  SMS_ENDPOINT: Joi.string().uri().allow('').optional(),

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
  // 현재 모든 환경에서 인스턴스 메모리 저장소를 사용하며, Redis 분산 전환은 N11 후속 작업.
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

  // N3: S3 이미지 저장 (동의 기반). 개발/테스트만 빈 값일 때 Memory store 허용.
  S3_BUCKET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().trim().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  AWS_REGION: Joi.string().default('ap-northeast-2'),
  // SSE-KMS 사용 시. 비우면 SSE-S3 AES256.
  S3_KMS_KEY_ID: Joi.string().allow('').optional(),

  // N6 Soft Delete
  SOFT_DELETE_RETENTION_DAYS: Joi.number().integer().min(1).default(30),
  SOFT_DELETE_PURGE_INTERVAL_MS: Joi.number().integer().min(0).default(3_600_000),

  // N6: production unknown key 검사에 사용하는 선언 목록(선택)
  APP_ENV_KEYS: Joi.string().allow('').optional(),
});


/**
 * Nest ConfigModule validation 전/후 보조.
 * production에서 mock flag·unknown key(APP_ENV_KEYS)를 엄격 검사한다.
 */
export function validateEnvWithRegistry(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = envValidationSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }
  const nodeEnv = String(value.NODE_ENV ?? config.NODE_ENV ?? 'development');
  if (nodeEnv === 'production') {
    const regErrors = validateProductionEnv({ ...config, ...value });
    if (regErrors.length) {
      throw new Error(`Config registry error: ${regErrors.join('; ')}`);
    }
  }
  return value as Record<string, unknown>;
}
