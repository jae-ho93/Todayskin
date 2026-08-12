import { HttpException } from '@nestjs/common';

/**
 * 도메인 예외를 잡 실패 메시지로 바꾼다.
 *
 * `HttpException`을 그대로 던지면 상태 코드만 남고 사용자에게 보여줄 메시지가
 * 잡 결과에 들어가지 않는다. 잡은 HTTP 응답이 아니므로 메시지만 꺼내 전달한다.
 */
export function toJobError(e: unknown): Error {
  if (e instanceof HttpException) {
    const res = e.getResponse();
    const message =
      typeof res === 'string'
        ? res
        : typeof res === 'object' && res !== null && 'message' in res
          ? Array.isArray((res as { message: unknown }).message)
            ? (res as { message: string[] }).message.join(', ')
            : String((res as { message: unknown }).message)
          : e.message;
    return new Error(message);
  }
  if (e instanceof Error) return e;
  return new Error(String(e));
}

/**
 * R12: 핸들러 진입점의 payload 검증.
 *
 * payload는 큐를 거쳐 온 JSON이라 타입 보장이 없다. 이전에는 `payload.x as string`으로
 * 단언만 하고 넘겨 잘못된 값이 도메인 서비스 깊은 곳에서 터졌다. 진입점에서 좁히고
 * 어긋나면 명시적으로 실패시킨다.
 */
export function optionalString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`잡 payload의 ${key}는 문자열이어야 합니다`);
  }
  return value;
}

export function optionalNumber(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`잡 payload의 ${key}는 숫자여야 합니다`);
  }
  return value;
}

export function optionalObject(
  payload: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`잡 payload의 ${key}는 객체여야 합니다`);
  }
  return value as Record<string, unknown>;
}
