/**
 * 환경변수 registry (N6).
 * owner · description · requiredEnv · safeDefault · secret 여부를 한곳에서 관리한다.
 *
 * 규칙:
 * - mock flag는 test/dev 전용. owner/expiry 없는 mock flag는 production merge 거부.
 * - production에서 registry에 없는 unknown key는 엄격 처리(경고 후 거부 옵션).
 */

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
  /** mock/feature flag — production에서는 false 강제 또는 금지 */
  mockFlag?: boolean;
  /** mock flag 만료일(ISO). owner+expiry 없으면 production merge 거부. */
  expiry?: string;
}

export const ENV_REGISTRY: EnvVarDefinition[] = [
  { key: 'NODE_ENV', owner: 'platform', description: 'runtime environment', requiredIn: ['*'], safeDefault: 'development', secret: false },
  { key: 'PORT', owner: 'platform', description: 'HTTP listen port', requiredIn: 'never', safeDefault: 3000, secret: false },
  { key: 'ALLOWED_ORIGINS', owner: 'security', description: 'CORS allowlist (comma-separated)', requiredIn: 'never', safeDefault: '', secret: false },

  { key: 'DATABASE_URL', owner: 'platform', description: 'PostgreSQL connection string', requiredIn: ['development', 'production'], secret: true },
  { key: 'SHADOW_DATABASE_URL', owner: 'platform', description: 'Prisma migrate diff shadow DB', requiredIn: 'never', secret: true },
  { key: 'REDIS_URL', owner: 'platform', description: 'Redis connection URL (optional cache/jobs)', requiredIn: 'never', safeDefault: '', secret: true },
  { key: 'WEATHER_CACHE_TTL_SECONDS', owner: 'weather', description: 'Weather cache TTL seconds', requiredIn: 'never', safeDefault: 300, secret: false },
  { key: 'JOB_DISPATCHER', owner: 'jobs', description: 'Job dispatcher mode auto|inline|bullmq', requiredIn: 'never', safeDefault: 'auto', secret: false },

  { key: 'JWT_ACCESS_SECRET', owner: 'auth', description: 'Access JWT HMAC secret', requiredIn: ['development', 'production'], secret: true },
  { key: 'JWT_REFRESH_SECRET', owner: 'auth', description: 'Refresh JWT HMAC secret', requiredIn: ['development', 'production'], secret: true },
  { key: 'ACCESS_TOKEN_EXPIRES_IN', owner: 'auth', description: 'Access token lifetime', requiredIn: 'never', safeDefault: '15m', secret: false },
  { key: 'REFRESH_TOKEN_EXPIRES_IN', owner: 'auth', description: 'Refresh token lifetime', requiredIn: 'never', safeDefault: '14d', secret: false },

  { key: 'OTP_TTL_SECONDS', owner: 'auth', description: 'OTP code TTL seconds', requiredIn: 'never', safeDefault: 180, secret: false },
  { key: 'OTP_MAX_ATTEMPTS', owner: 'auth', description: 'OTP max verify attempts', requiredIn: 'never', safeDefault: 5, secret: false },
  { key: 'OTP_RESEND_COOLDOWN_SECONDS', owner: 'auth', description: 'OTP resend cooldown', requiredIn: 'never', safeDefault: 60, secret: false },
  { key: 'OTP_MAX_PENDING_PER_PHONE', owner: 'auth', description: 'Max pending OTP per phone', requiredIn: 'never', safeDefault: 3, secret: false },
  { key: 'OTP_DAILY_LIMIT_PER_PHONE', owner: 'auth', description: 'Max OTP sends per phone per KST day (0=unlimited, allowlisted phones exempt)', requiredIn: 'never', safeDefault: 10, secret: false },
  { key: 'OTP_ALLOWLIST_PHONES', owner: 'auth', description: 'Dev allowlisted phones for mock OTP', requiredIn: 'never', safeDefault: '', secret: false, mockFlag: true, expiry: '2027-01-01' },

  // N9: 운영 OTP 게이트웨이 — OCTOMO MO 인증. production에서 누락 시 readiness 실패.
  { key: 'OCTOMO_API_KEY', owner: 'auth', description: 'OCTOMO API key (Authorization: Octomo {key})', requiredIn: ['production'], secret: true },
  { key: 'OCTOMO_ENDPOINT', owner: 'auth', description: 'OCTOMO exists API endpoint', requiredIn: 'never', secret: false },
  { key: 'OCTOMO_RECIPIENT_NUMBER', owner: 'auth', description: 'MO 수신 번호 (사용자가 인증문자를 보낼 번호)', requiredIn: 'never', safeDefault: '1666-3538', secret: false },
  { key: 'OCTOMO_TIMEOUT_MS', owner: 'auth', description: 'OCTOMO request timeout ms', requiredIn: 'never', safeDefault: 10_000, secret: false },
  { key: 'OCTOMO_MAX_RETRIES', owner: 'auth', description: 'OCTOMO network retry count (max 2)', requiredIn: 'never', safeDefault: 1, secret: false },

  { key: 'KMA_API_KEY', owner: 'weather', description: 'KMA API key', requiredIn: 'never', secret: true },
  { key: 'AIRKOREA_API_KEY', owner: 'weather', description: 'AirKorea API key', requiredIn: 'never', secret: true },
  { key: 'KMA_AREA_NO', owner: 'weather', description: 'Default KMA area number fallback', requiredIn: 'never', secret: false },
  { key: 'AIRKOREA_STATION_NAME', owner: 'weather', description: 'Default AirKorea station fallback', requiredIn: 'never', secret: false },

  { key: 'GEMINI_API_KEY', owner: 'ai', description: 'Gemini API key', requiredIn: 'never', secret: true },
  { key: 'GEMINI_MODEL', owner: 'ai', description: 'Gemini model id', requiredIn: 'never', safeDefault: 'gemini-flash-latest', secret: false },
  { key: 'MOCK_GEMINI', owner: 'ai', description: 'Use Gemini mock responses (dev/test only)', requiredIn: 'never', safeDefault: 'false', secret: false, mockFlag: true, expiry: '2027-01-01' },

  // N33: 소셜 로그인 — 제공자 검증용 설정. 미설정 시 해당 제공자 요청만 401(명시적 실패).
  { key: 'GOOGLE_CLIENT_ID', owner: 'auth', description: 'Google OAuth client id (id_token aud 검증)', requiredIn: 'never', safeDefault: '', secret: false },
  { key: 'APPLE_BUNDLE_ID', owner: 'auth', description: 'Apple 번들 id (identity token aud 검증)', requiredIn: 'never', safeDefault: '', secret: false },
  { key: 'MOCK_SOCIAL', owner: 'auth', description: '소셜 토큰 검증 mock (dev/test only)', requiredIn: 'never', safeDefault: 'false', secret: false, mockFlag: true, expiry: '2027-01-01' },
  { key: 'MOCK_INFERENCE', owner: 'diagnosis', description: 'Use mock diagnosis inference (dev/test only)', requiredIn: 'never', safeDefault: 'false', secret: false, mockFlag: true, expiry: '2027-01-01' },
  { key: 'INFERENCE_SERVICE_URL', owner: 'diagnosis', description: 'Python inference service base URL', requiredIn: 'never', secret: false },
  // N13: NestJS↔inference-service 내부망 인증 shared secret (INFERENCE_SERVICE_URL과 함께 설정).
  { key: 'INFERENCE_SHARED_SECRET', owner: 'diagnosis', description: 'Shared secret for NestJS↔inference-service internal auth', requiredIn: 'never', secret: true },

  { key: 'THROTTLE_LIMIT', owner: 'security', description: 'Rate limit max requests per window', requiredIn: 'never', safeDefault: 60, secret: false },
  { key: 'THROTTLE_TTL_MS', owner: 'security', description: 'Rate limit window ms', requiredIn: 'never', safeDefault: 60_000, secret: false },
  // N11: 분산 rate limit 저장소. auto=REDIS_URL 설정 시 Redis, 아니면 memory.
  { key: 'THROTTLE_STORAGE', owner: 'security', description: 'Rate limit storage: auto|memory|redis', requiredIn: 'never', safeDefault: 'auto', secret: false },
  { key: 'JOB_METRICS_INTERVAL_MS', owner: 'jobs', description: 'BullMQ queue/DLQ metrics collection interval ms (0=disabled)', requiredIn: 'never', safeDefault: 60_000, secret: false },

  // N34: 푸시 실제 발송(FCM/APNs) 지원 여부. false면 FE는 알림 토글을
  // "되는 것처럼 보이는" 토글이 아닌 비활성/준비 중으로 표시해야 한다.
  // 게이트웨이 연동 시 배포에서 true로 flip한다 (코드 재배포 불필요).
  { key: 'PUSH_DELIVERY_AVAILABLE', owner: 'platform', description: '실제 푸시 발송(FCM/APNs) 지원 여부 — false면 FE가 거짓 토글 노출 금지', requiredIn: 'never', safeDefault: 'false', secret: false },

  { key: 'LOG_LEVEL', owner: 'observability', description: 'Pino log level', requiredIn: 'never', safeDefault: 'info', secret: false },
  { key: 'SENTRY_DSN', owner: 'observability', description: 'Sentry DSN', requiredIn: 'never', secret: true },
  { key: 'SENTRY_TRACES_SAMPLE_RATE', owner: 'observability', description: 'Sentry traces sample rate', requiredIn: 'never', safeDefault: 0.1, secret: false },

  { key: 'S3_BUCKET', owner: 'storage', description: 'Diagnosis image S3 bucket', requiredIn: ['production'], secret: false },
  { key: 'AWS_REGION', owner: 'storage', description: 'AWS region', requiredIn: 'never', safeDefault: 'ap-northeast-2', secret: false },
  { key: 'S3_KMS_KEY_ID', owner: 'storage', description: 'Optional SSE-KMS key id', requiredIn: 'never', secret: true },
  { key: 'AWS_ACCESS_KEY_ID', owner: 'storage', description: 'AWS access key (local only; prefer IAM role)', requiredIn: 'never', secret: true },
  { key: 'AWS_SECRET_ACCESS_KEY', owner: 'storage', description: 'AWS secret key (local only; prefer IAM role)', requiredIn: 'never', secret: true },

  // N10: 이미지 저장소 reconciliation
  { key: 'IMAGE_RECONCILE_INTERVAL_MS', owner: 'storage', description: 'Image delete retry / orphan scan scheduler interval ms (0=disabled)', requiredIn: 'never', safeDefault: 3_600_000, secret: false },
  { key: 'IMAGE_DELETE_MAX_ATTEMPTS', owner: 'storage', description: 'Max delete retry attempts before permanent-failure alert', requiredIn: 'never', safeDefault: 10, secret: false },

  { key: 'RUN_MIGRATIONS_ON_START', owner: 'deploy', description: 'Run prisma migrate on container start (local only)', requiredIn: 'never', safeDefault: 'false', secret: false, mockFlag: true, expiry: '2027-01-01' },

  { key: 'SOFT_DELETE_RETENTION_DAYS', owner: 'platform', description: 'Soft-delete retention days before purge', requiredIn: 'never', safeDefault: 30, secret: false },
  { key: 'SOFT_DELETE_PURGE_INTERVAL_MS', owner: 'platform', description: 'Purge scheduler interval ms (0=disabled)', requiredIn: 'never', safeDefault: 3_600_000, secret: false },

  { key: 'WEATHER_COLLECTION_INTERVAL_MS', owner: 'platform', description: 'Background weather collection scheduler interval ms (0=disabled)', requiredIn: 'never', safeDefault: 3_600_000, secret: false },
  { key: 'WEATHER_COLLECTOR_ENABLED', owner: 'platform', description: 'Enable background weather collection scheduler (keep true on exactly one ECS task)', requiredIn: 'never', safeDefault: 'true', secret: false },
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
