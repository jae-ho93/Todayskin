import { buildEnvValidationSchema, validateProductionEnv } from './env.registry';

/**
 * 환경변수 검증 스키마.
 *
 * R18: 규칙은 `env.registry.ts`의 각 항목 `schema`에 있다. 이 파일은 조립과
 * production 추가 검증만 담당한다 — 목록이 두 곳으로 갈라지면 실제로 어긋나므로
 * (누락된 키는 검증을 그대로 통과했다) 단일 출처를 유지한다.
 */
export const envValidationSchema = buildEnvValidationSchema();

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
