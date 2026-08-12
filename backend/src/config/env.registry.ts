/**
 * 환경변수 registry (N6).
 * owner · description · requiredEnv · safeDefault · secret 여부 · Joi 규칙을 한곳에서 관리한다.
 *
 * R18: 이 파일이 환경변수 정의의 단일 출처다. `envValidationSchema`는 여기 `schema`
 * 필드로부터 생성되므로(env.validation.ts), 키를 추가하면서 검증 규칙을 빠뜨리거나
 * 두 목록이 어긋나는 일이 구조적으로 불가능하다.
 *
 * 규칙:
 * - mock flag는 test/dev 전용. owner/expiry 없는 mock flag는 production merge 거부.
 * - production에서 registry에 없는 unknown key는 엄격 처리(경고 후 거부 옵션).
 */

import * as Joi from 'joi';

export type EnvOwner =
  | 'platform'
  | 'auth'
  | 'weather'
  | 'diagnosis'
  | 'ai'
  | 'security'
  | 'observability'
  | 'storage'
  | 'jobs'
  | 'deploy';

export interface EnvVarDefinition {
  key: string;
  owner: EnvOwner;
  description: string;
  /** NODE_ENV별 required. true면 해당 env에서 필수. */
  requiredIn: Array<'development' | 'test' | 'production' | '*'> | 'never';
  safeDefault?: string | number | boolean | null;
  secret: boolean;
  /** 부팅 시 적용되는 Joi 규칙. envValidationSchema가 이 값들로 조립된다. */
  schema: Joi.Schema;
  /** mock/feature flag — production에서는 false 강제 또는 금지 */
  mockFlag?: boolean;
  /** mock flag 만료일(ISO). owner+expiry 없으면 production merge 거부. */
  expiry?: string;
}

/** mock/feature flag 공통 규칙 — 'true'|'false' 문자열만 허용한다. */
const booleanFlag = Joi.string().valid('true', 'false').allow('').optional();

export const ENV_REGISTRY: EnvVarDefinition[] = [
  {
    key: 'NODE_ENV',
    owner: 'platform',
    description: 'runtime environment',
    requiredIn: ['*'],
    safeDefault: 'development',
    secret: false,
    schema: Joi.string().valid('development', 'test', 'production').default('development'),
  },
  {
    key: 'PORT',
    owner: 'platform',
    description: 'HTTP listen port',
    requiredIn: 'never',
    safeDefault: 3000,
    secret: false,
    schema: Joi.number().port().default(3000),
  },
  {
    key: 'ALLOWED_ORIGINS',
    owner: 'security',
    description: 'CORS allowlist (comma-separated)',
    requiredIn: 'never',
    safeDefault: '',
    secret: false,
    // 예: http://localhost:8081,https://app.todayskin.kr
    schema: Joi.string().allow('').default(''),
  },

  {
    key: 'DATABASE_URL',
    owner: 'platform',
    description: 'PostgreSQL connection string',
    requiredIn: ['development', 'production'],
    secret: true,
    // T2: test 환경만 예외 — PrismaModule이 인스턴스화되지 않을 수 있다.
    schema: Joi.when('NODE_ENV', {
      is: 'test',
      then: Joi.string().uri().allow('').optional(),
      otherwise: Joi.string().uri().required(),
    }),
  },
  {
    key: 'TEST_DATABASE_URL',
    owner: 'platform',
    description: 'DB 통합 테스트용 연결 문자열 (미설정 시 해당 spec은 skip)',
    requiredIn: 'never',
    secret: true,
    schema: Joi.string().uri().allow('').optional(),
  },
  {
    key: 'SHADOW_DATABASE_URL',
    owner: 'platform',
    description: 'Prisma migrate diff shadow DB',
    requiredIn: 'never',
    secret: true,
    schema: Joi.string().uri().allow('').optional(),
  },
  {
    key: 'REDIS_URL',
    owner: 'platform',
    description: 'Redis connection URL (optional cache/jobs)',
    requiredIn: 'never',
    safeDefault: '',
    secret: true,
    // 캐시 장애 시에도 앱이 동작해야 하므로 선택 사항. BullMQ 모드에서만 필수.
    schema: Joi.when('JOB_DISPATCHER', {
      is: 'bullmq',
      then: Joi.string().uri().required(),
      otherwise: Joi.string().uri().allow('').optional(),
    }),
  },
  {
    key: 'WEATHER_CACHE_TTL_SECONDS',
    owner: 'weather',
    description: 'Weather cache TTL seconds',
    requiredIn: 'never',
    safeDefault: 300,
    secret: false,
    // T12: 기본 300초(5분) — 정부 API 분 단위 갱신 기준.
    schema: Joi.number().integer().min(0).default(300),
  },
  {
    key: 'JOB_DISPATCHER',
    owner: 'jobs',
    description: 'Job dispatcher mode auto|inline|bullmq',
    requiredIn: 'never',
    safeDefault: 'auto',
    secret: false,
    // N4: auto=REDIS_URL 있으면 BullMQ, 없으면 Inline. inline은 Redis 없이
    // 동일한 PENDING→COMPLETED 계약을 유지한다.
    schema: Joi.string().valid('auto', 'inline', 'bullmq').default('auto'),
  },
  {
    key: 'RETENTION_SWEEP_MODE',
    owner: 'platform',
    description: 'R11 보존 정책 스윕 모드 off|dry-run|delete (기본 off — 되돌릴 수 없는 DELETE)',
    requiredIn: 'never',
    safeDefault: 'off',
    secret: false,
    // R11: 기본 off. dry-run으로 규모를 확인하고 스냅샷 확보 후 delete로 올린다.
    schema: Joi.string().valid('off', 'dry-run', 'delete').default('off'),
  },
  {
    key: 'RETENTION_BATCH_SIZE',
    owner: 'platform',
    description: 'R11 보존 스윕 배치 크기 (한 번에 삭제할 행 수)',
    requiredIn: 'never',
    safeDefault: 1_000,
    secret: false,
    schema: Joi.number().integer().min(1).max(10_000).default(1_000),
  },
  {
    key: 'RETENTION_REFRESH_SESSION_DAYS',
    owner: 'auth',
    description: 'R11 만료·폐기 RefreshSession 보존 일수',
    requiredIn: 'never',
    safeDefault: 7,
    secret: false,
    // R21 재사용 탐지가 폐기된 세션을 참조하므로 너무 짧게 두지 않는다.
    schema: Joi.number().integer().min(1).default(7),
  },
  {
    key: 'RETENTION_ASYNC_JOB_DAYS',
    owner: 'jobs',
    description: 'R11 완료/실패 AsyncJob 보존 일수 (PENDING은 삭제하지 않음)',
    requiredIn: 'never',
    safeDefault: 30,
    secret: false,
    schema: Joi.number().integer().min(1).default(30),
  },
  {
    key: 'RETENTION_AI_RESERVATION_DAYS',
    owner: 'platform',
    description: 'R11 완료된 AiCallReservation 보존 일수',
    requiredIn: 'never',
    safeDefault: 1,
    secret: false,
    schema: Joi.number().integer().min(1).default(1),
  },
  {
    key: 'RETENTION_OTP_DAYS',
    owner: 'auth',
    description: 'R11 OtpCode/OtpSendLog 보존 일수',
    requiredIn: 'never',
    safeDefault: 30,
    secret: false,
    schema: Joi.number().integer().min(1).default(30),
  },
  {
    key: 'RETENTION_WEATHER_SNAPSHOT_DAYS',
    owner: 'weather',
    description: 'R11 WeatherSnapshot 보존 일수 — 개인 패턴 분석 기간을 넘겨야 한다',
    requiredIn: 'never',
    safeDefault: 400,
    secret: false,
    // 패턴 분석이 보는 창보다 짧게 두면 사용자 화면에서 히스토리가 사라진다.
    schema: Joi.number().integer().min(30).default(400),
  },
  {
    key: 'REFRESH_REUSE_GRACE_MS',
    owner: 'auth',
    description: 'R21 폐기된 refresh 토큰 재사용을 재시도로 인정하는 유예(ms)',
    requiredIn: 'never',
    safeDefault: 10_000,
    secret: false,
    // 0으로 두면 정상 클라이언트의 재시도 한 번에 계열 전체가 폐기된다.
    schema: Joi.number().integer().min(0).default(10_000),
  },
  {
    key: 'JOB_ROLE',
    owner: 'jobs',
    description: 'Process role api|worker|both — api는 enqueue만, worker는 잡·스케줄러 담당',
    requiredIn: 'never',
    safeDefault: 'both',
    secret: false,
    // R13: 기본 both = 기존 동작(단일 서비스). worker 서비스를 띄운 뒤에 api로 내린다.
    schema: Joi.string().valid('api', 'worker', 'both').default('both'),
  },
  {
    key: 'JOB_WORKER_CONCURRENCY',
    owner: 'jobs',
    description: 'BullMQ worker concurrency per queue',
    requiredIn: 'never',
    safeDefault: 2,
    secret: false,
    // R13: 워커 전용 프로세스는 API 지연 영향이 없으므로 올릴 수 있다. 기본은 기존 값(2).
    schema: Joi.number().integer().min(1).max(50).default(2),
  },

  {
    key: 'JWT_ACCESS_SECRET',
    owner: 'auth',
    description: 'Access JWT HMAC secret',
    requiredIn: ['development', 'production'],
    secret: true,
    // T3: test 환경을 제외하고 required. 최소 32자.
    schema: Joi.when('NODE_ENV', {
      is: 'test',
      then: Joi.string().allow('').optional(),
      otherwise: Joi.string().min(32).required(),
    }),
  },
  {
    key: 'JWT_REFRESH_SECRET',
    owner: 'auth',
    description: 'Refresh JWT HMAC secret',
    requiredIn: ['development', 'production'],
    secret: true,
    schema: Joi.when('NODE_ENV', {
      is: 'test',
      then: Joi.string().allow('').optional(),
      otherwise: Joi.string().min(32).required(),
    }),
  },
  {
    key: 'ACCESS_TOKEN_EXPIRES_IN',
    owner: 'auth',
    description: 'Access token lifetime',
    requiredIn: 'never',
    safeDefault: '15m',
    secret: false,
    schema: Joi.string().default('15m'),
  },
  {
    key: 'REFRESH_TOKEN_EXPIRES_IN',
    owner: 'auth',
    description: 'Refresh token lifetime',
    requiredIn: 'never',
    safeDefault: '14d',
    secret: false,
    schema: Joi.string().default('14d'),
  },

  // N2: OTP 인증 — 가입·새 디바이스 로그인에 OTP 필수 (운영 공개 전)
  {
    key: 'OTP_TTL_SECONDS',
    owner: 'auth',
    description: 'OTP code TTL seconds',
    requiredIn: 'never',
    safeDefault: 180,
    secret: false,
    schema: Joi.number().integer().min(10).default(180),
  },
  {
    key: 'OTP_MAX_ATTEMPTS',
    owner: 'auth',
    description: 'OTP max verify attempts',
    requiredIn: 'never',
    safeDefault: 5,
    secret: false,
    schema: Joi.number().integer().min(1).default(5),
  },
  {
    key: 'OTP_RESEND_COOLDOWN_SECONDS',
    owner: 'auth',
    description: 'OTP resend cooldown',
    requiredIn: 'never',
    safeDefault: 60,
    secret: false,
    schema: Joi.number().integer().min(0).default(60),
  },
  {
    key: 'OTP_MAX_PENDING_PER_PHONE',
    owner: 'auth',
    description: 'Max pending OTP per phone',
    requiredIn: 'never',
    safeDefault: 3,
    secret: false,
    schema: Joi.number().integer().min(1).default(3),
  },
  {
    key: 'OTP_DAILY_LIMIT_PER_PHONE',
    owner: 'auth',
    description:
      'Max OTP sends per phone per KST day (0=unlimited, allowlisted phones exempt)',
    requiredIn: 'never',
    safeDefault: 10,
    secret: false,
    schema: Joi.number().integer().min(0).default(10),
  },
  {
    key: 'OTP_ALLOWLIST_PHONES',
    owner: 'auth',
    description: 'Dev allowlisted phones for mock OTP',
    requiredIn: 'never',
    safeDefault: '',
    secret: false,
    mockFlag: true,
    expiry: '2027-01-01',
    // 쉼표 구분, 하이픈 제거. 예: 01012345678,01099999999
    schema: Joi.string().allow('').default(''),
  },

  // N9: 운영 OTP 게이트웨이 — OCTOMO MO 인증. production에서 누락 시 readiness 실패.
  {
    key: 'OCTOMO_API_KEY',
    owner: 'auth',
    description: 'OCTOMO API key (Authorization: Octomo {key})',
    requiredIn: ['production'],
    secret: true,
    schema: Joi.string().allow('').optional(),
  },
  {
    key: 'OCTOMO_ENDPOINT',
    owner: 'auth',
    description: 'OCTOMO exists API endpoint',
    requiredIn: 'never',
    secret: false,
    schema: Joi.string().uri().allow('').optional(),
  },
  {
    key: 'OCTOMO_RECIPIENT_NUMBER',
    owner: 'auth',
    description: 'MO 수신 번호 (사용자가 인증문자를 보낼 번호)',
    requiredIn: 'never',
    safeDefault: '1666-3538',
    secret: false,
    schema: Joi.string().allow('').optional(),
  },
  {
    key: 'OCTOMO_TIMEOUT_MS',
    owner: 'auth',
    description: 'OCTOMO request timeout ms',
    requiredIn: 'never',
    safeDefault: 10_000,
    secret: false,
    schema: Joi.number().integer().min(100).default(10_000),
  },
  {
    key: 'OCTOMO_MAX_RETRIES',
    owner: 'auth',
    description: 'OCTOMO network retry count (max 2)',
    requiredIn: 'never',
    safeDefault: 1,
    secret: false,
    schema: Joi.number().integer().min(0).max(2).default(1),
  },

  {
    key: 'KMA_API_KEY',
    owner: 'weather',
    description: 'KMA API key',
    requiredIn: 'never',
    secret: true,
    schema: Joi.string().allow('').optional(),
  },
  {
    key: 'AIRKOREA_API_KEY',
    owner: 'weather',
    description: 'AirKorea API key',
    requiredIn: 'never',
    secret: true,
    schema: Joi.string().allow('').optional(),
  },
  {
    key: 'KMA_AREA_NO',
    owner: 'weather',
    description: 'Default KMA area number fallback',
    requiredIn: 'never',
    secret: false,
    // T5: 비워두면 REGIONS 기본값(서울 종로구)을 사용한다.
    schema: Joi.string().allow('').optional(),
  },
  {
    key: 'AIRKOREA_STATION_NAME',
    owner: 'weather',
    description: 'Default AirKorea station fallback',
    requiredIn: 'never',
    secret: false,
    schema: Joi.string().allow('').optional(),
  },

  {
    key: 'GEMINI_API_KEY',
    owner: 'ai',
    description: 'Gemini API key',
    requiredIn: 'never',
    secret: true,
    schema: Joi.string().allow('').optional(),
  },
  {
    key: 'GEMINI_MODEL',
    owner: 'ai',
    description: 'Gemini model id',
    requiredIn: 'never',
    safeDefault: 'gemini-flash-latest',
    secret: false,
    schema: Joi.string().default('gemini-flash-latest'),
  },
  {
    key: 'MOCK_GEMINI',
    owner: 'ai',
    description: 'Use Gemini mock responses (dev/test only)',
    requiredIn: 'never',
    safeDefault: 'false',
    secret: false,
    mockFlag: true,
    expiry: '2027-01-01',
    // default를 두면 process.env 값을 덮어쓰는 경우가 있어 기본값을 생략한다.
    schema: booleanFlag,
  },

  // N33: 소셜 로그인 — 제공자 검증용 설정. 미설정 시 해당 제공자 요청만 401(명시적 실패).
  {
    key: 'GOOGLE_CLIENT_ID',
    owner: 'auth',
    description: 'Google OAuth client id (id_token aud 검증)',
    requiredIn: 'never',
    safeDefault: '',
    secret: false,
    schema: Joi.string().allow('').default(''),
  },
  {
    key: 'APPLE_BUNDLE_ID',
    owner: 'auth',
    description: 'Apple 번들 id (identity token aud 검증)',
    requiredIn: 'never',
    safeDefault: '',
    secret: false,
    schema: Joi.string().allow('').default(''),
  },
  {
    key: 'MOCK_SOCIAL',
    owner: 'auth',
    description: '소셜 토큰 검증 mock (dev/test only)',
    requiredIn: 'never',
    safeDefault: 'false',
    secret: false,
    mockFlag: true,
    expiry: '2027-01-01',
    schema: booleanFlag,
  },
  {
    key: 'MOCK_INFERENCE',
    owner: 'diagnosis',
    description: 'Use mock diagnosis inference (dev/test only)',
    requiredIn: 'never',
    safeDefault: 'false',
    secret: false,
    mockFlag: true,
    expiry: '2027-01-01',
    schema: booleanFlag,
  },
  {
    key: 'INFERENCE_SERVICE_URL',
    owner: 'diagnosis',
    description: 'Python inference service base URL',
    requiredIn: 'never',
    secret: false,
    schema: Joi.string().uri({ scheme: ['http', 'https'] }).allow('').optional(),
  },
  {
    key: 'INFERENCE_SHARED_SECRET',
    owner: 'diagnosis',
    description: 'Shared secret for NestJS↔inference-service internal auth',
    requiredIn: 'never',
    secret: true,
    // N13: 내부망 인증. INFERENCE_SERVICE_URL과 함께 설정한다.
    schema: Joi.string().allow('').optional(),
  },

  {
    key: 'THROTTLE_LIMIT',
    owner: 'security',
    description: 'Rate limit max requests per window',
    requiredIn: 'never',
    safeDefault: 60,
    secret: false,
    schema: Joi.number().integer().min(1).default(60),
  },
  {
    key: 'THROTTLE_TTL_MS',
    owner: 'security',
    description: 'Rate limit window ms',
    requiredIn: 'never',
    safeDefault: 60_000,
    secret: false,
    schema: Joi.number().integer().min(100).default(60_000),
  },
  {
    key: 'THROTTLE_STORAGE',
    owner: 'security',
    description: 'Rate limit storage: auto|memory|redis',
    requiredIn: 'never',
    safeDefault: 'auto',
    secret: false,
    // N11: auto=REDIS_URL 설정 시 Redis, 아니면 memory. 강제도 가능.
    schema: Joi.string().valid('auto', 'memory', 'redis').default('auto'),
  },
  {
    key: 'JOB_METRICS_INTERVAL_MS',
    owner: 'jobs',
    description: 'BullMQ queue/DLQ metrics collection interval ms (0=disabled)',
    requiredIn: 'never',
    safeDefault: 60_000,
    secret: false,
    schema: Joi.number().integer().min(0).default(60_000),
  },

  {
    key: 'PUSH_DELIVERY_AVAILABLE',
    owner: 'platform',
    description: '실제 푸시 발송(FCM/APNs) 지원 여부 — false면 FE가 거짓 토글 노출 금지',
    requiredIn: 'never',
    safeDefault: 'false',
    secret: false,
    // N34: 게이트웨이 연동 시 배포에서 true로 flip한다 (코드 재배포 불필요).
    schema: Joi.string().valid('true', 'false').allow('').default('false'),
  },

  {
    key: 'LOG_LEVEL',
    owner: 'observability',
    description: 'Pino log level',
    requiredIn: 'never',
    safeDefault: 'info',
    secret: false,
    schema: Joi.string()
      .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
      .default('info'),
  },
  {
    key: 'SENTRY_DSN',
    owner: 'observability',
    description: 'Sentry DSN',
    requiredIn: 'never',
    secret: true,
    // 비워두면 Sentry 비활성화. 운영에서만 설정 권장.
    schema: Joi.string().uri().allow('').optional(),
  },
  {
    key: 'SENTRY_TRACES_SAMPLE_RATE',
    owner: 'observability',
    description: 'Sentry traces sample rate',
    requiredIn: 'never',
    safeDefault: 0.1,
    secret: false,
    schema: Joi.number().min(0).max(1).default(0.1),
  },

  {
    key: 'S3_BUCKET',
    owner: 'storage',
    description: 'Diagnosis image S3 bucket',
    requiredIn: ['production'],
    secret: false,
    // N3: 개발/테스트만 빈 값(Memory store) 허용.
    schema: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.string().trim().min(1).required(),
      otherwise: Joi.string().allow('').optional(),
    }),
  },
  {
    key: 'AWS_REGION',
    owner: 'storage',
    description: 'AWS region',
    requiredIn: 'never',
    safeDefault: 'ap-northeast-2',
    secret: false,
    schema: Joi.string().default('ap-northeast-2'),
  },
  {
    key: 'S3_KMS_KEY_ID',
    owner: 'storage',
    description: 'Optional SSE-KMS key id',
    requiredIn: 'never',
    secret: true,
    // 비우면 SSE-S3 AES256.
    schema: Joi.string().allow('').optional(),
  },
  {
    key: 'AWS_ACCESS_KEY_ID',
    owner: 'storage',
    description: 'AWS access key (local only; prefer IAM role)',
    requiredIn: 'never',
    secret: true,
    schema: Joi.string().allow('').optional(),
  },
  {
    key: 'AWS_SECRET_ACCESS_KEY',
    owner: 'storage',
    description: 'AWS secret key (local only; prefer IAM role)',
    requiredIn: 'never',
    secret: true,
    schema: Joi.string().allow('').optional(),
  },
  {
    key: 'DEV_STORAGE_BASE_URL',
    owner: 'storage',
    description: '개발용 Memory store 이미지 서빙 origin (미설정 시 127.0.0.1:PORT)',
    requiredIn: 'never',
    secret: false,
    // 실기기 테스트 시 Mac LAN IP로 설정한다.
    schema: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
  },

  // N10: 이미지 저장소 reconciliation
  {
    key: 'IMAGE_RECONCILE_INTERVAL_MS',
    owner: 'storage',
    description: 'Image delete retry / orphan scan scheduler interval ms (0=disabled)',
    requiredIn: 'never',
    safeDefault: 3_600_000,
    secret: false,
    schema: Joi.number().integer().min(0).default(3_600_000),
  },
  {
    key: 'IMAGE_DELETE_MAX_ATTEMPTS',
    owner: 'storage',
    description: 'Max delete retry attempts before permanent-failure alert',
    requiredIn: 'never',
    safeDefault: 10,
    secret: false,
    // 초과 시 permanent failure 감사 로그(알림 채널).
    schema: Joi.number().integer().min(1).default(10),
  },

  {
    key: 'RUN_MIGRATIONS_ON_START',
    owner: 'deploy',
    description: 'Run prisma migrate on container start (local only)',
    requiredIn: 'never',
    safeDefault: 'false',
    secret: false,
    mockFlag: true,
    expiry: '2027-01-01',
    schema: booleanFlag,
  },

  {
    key: 'SOFT_DELETE_RETENTION_DAYS',
    owner: 'platform',
    description: 'Soft-delete retention days before purge',
    requiredIn: 'never',
    safeDefault: 30,
    secret: false,
    schema: Joi.number().integer().min(1).default(30),
  },
  {
    key: 'SOFT_DELETE_PURGE_INTERVAL_MS',
    owner: 'platform',
    description: 'Purge scheduler interval ms (0=disabled)',
    requiredIn: 'never',
    safeDefault: 3_600_000,
    secret: false,
    schema: Joi.number().integer().min(0).default(3_600_000),
  },

  {
    key: 'WEATHER_COLLECTION_INTERVAL_MS',
    owner: 'platform',
    description: 'Background weather collection scheduler interval ms (0=disabled)',
    requiredIn: 'never',
    safeDefault: 3_600_000,
    secret: false,
    // 개인 패턴 분석(T10)이 그날의 실제 최고 UV/오존/미세먼지에 가깝게 집계되도록,
    // 사용자가 앱을 안 켜도 등록된 전체 지역(REGIONS)을 주기적으로 수집해둔다.
    schema: Joi.number().integer().min(0).default(3_600_000),
  },
  {
    key: 'WEATHER_COLLECTOR_ENABLED',
    owner: 'platform',
    description:
      'Enable background weather collection scheduler (keep true on exactly one ECS task)',
    requiredIn: 'never',
    safeDefault: 'true',
    secret: false,
    // N21: ECS 다중 task에서 스케줄러 중복 실행 방지 — 정확히 1개 task만 true 유지.
    schema: Joi.string().valid('true', 'false').default('true'),
  },

  {
    key: 'APP_ENV_KEYS',
    owner: 'platform',
    description: 'N6: production unknown key 검사에 사용하는 선언 목록(선택)',
    requiredIn: 'never',
    secret: false,
    schema: Joi.string().allow('').optional(),
  },
];

const REGISTRY_BY_KEY = new Map(ENV_REGISTRY.map((d) => [d.key, d]));

export function getEnvDefinition(key: string): EnvVarDefinition | undefined {
  return REGISTRY_BY_KEY.get(key);
}

export function getRequiredEnvKeys(nodeEnv: string): string[] {
  return ENV_REGISTRY.filter((d) => {
    if (d.requiredIn === 'never') return false;
    return d.requiredIn.includes('*') || d.requiredIn.includes(nodeEnv as never);
  }).map((d) => d.key);
}

export function listKnownEnvKeys(): Set<string> {
  return new Set(ENV_REGISTRY.map((d) => d.key));
}

/**
 * R18: registry를 단일 출처로 삼아 부팅 검증 스키마를 조립한다.
 * 키를 registry에 추가하는 것만으로 검증 규칙이 함께 적용된다.
 */
export function buildEnvValidationSchema(): Joi.ObjectSchema {
  return Joi.object(
    Object.fromEntries(ENV_REGISTRY.map((d) => [d.key, d.schema])),
  );
}

/**
 * production unknown key / mock flag 검증.
 * unknown key가 있으면 에러 메시지 배열 반환.
 */
export function validateProductionEnv(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const known = listKnownEnvKeys();
  // process.env에는 PATH 등 시스템 키가 많으므로, 앱이 명시적으로 읽는 키만 검사하기보다
  // registry mock flag와 "앱 prefix" 없는 키는 스킵하고, registry에 등록된 mock만 강제한다.
  for (const def of ENV_REGISTRY) {
    if (!def.mockFlag) continue;
    const raw = env[def.key];
    if (raw === undefined || raw === null || String(raw).trim() === '' || String(raw) === 'false') {
      continue;
    }
    if (!def.owner || !def.expiry) {
      errors.push(`${def.key}: mock flag requires owner+expiry in registry`);
      continue;
    }
    if (new Date(def.expiry).getTime() < Date.now()) {
      errors.push(`${def.key}: mock flag expired (${def.expiry})`);
    }
    // production에서 mock flag truthy 금지
    if (String(env.NODE_ENV) === 'production') {
      errors.push(`${def.key}: mock flag must be false/empty in production`);
    }
  }

  // production unknown app keys: only keys that look like app config (UPPER_SNAKE) and
  // are present in a provided allowlist snapshot via APP_ENV_KEYS if set.
  const declared = env.APP_ENV_KEYS;
  if (typeof declared === 'string' && declared.trim()) {
    for (const key of declared.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!known.has(key)) {
        errors.push(`${key}: unknown env key (not in registry)`);
      }
    }
  }

  return errors;
}
