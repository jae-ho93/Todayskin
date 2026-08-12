import { ExecutionContext, SetMetadata } from '@nestjs/common';

/**
 * N47: 브루트포스 표적 라우트(인증·OTP) 전용 rate limit 정책.
 *
 * 이 데코레이터가 붙은 라우트는 별도 named throttler(SENSITIVE_THROTTLER)로
 * 더 낮은 한도를 적용받고, Redis 장애 시 fail-open(통과)이 아니라
 * **fail-closed(503 거부)** 로 동작한다. 나머지 라우트는 기존 fail-open 유지.
 */
export const SENSITIVE_THROTTLER = 'sensitive';

export const SENSITIVE_THROTTLE_KEY = 'rate-limit:fail-closed';

/** 컨트롤러 클래스 또는 개별 핸들러에 붙인다. */
export const SensitiveThrottle = () =>
  SetMetadata(SENSITIVE_THROTTLE_KEY, true);

/**
 * ThrottlerModule의 per-throttler skipIf에서 사용 — 데코레이터가 없는 라우트는
 * sensitive throttler를 건너뛴다. (모듈 팩토리 시점이라 Reflector 대신
 * SetMetadata가 기록한 메타데이터를 직접 읽는다.)
 */
export function isSensitiveThrottledRoute(context: ExecutionContext): boolean {
  return (
    Reflect.getMetadata(SENSITIVE_THROTTLE_KEY, context.getHandler()) === true ||
    Reflect.getMetadata(SENSITIVE_THROTTLE_KEY, context.getClass()) === true
  );
}
