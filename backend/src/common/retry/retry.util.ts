
/**
 * 일시 실패에만 쓰는 짧은 재시도 — N42.
 *
 * 정부 API(기상청·에어코리아)는 간헐적으로 타임아웃이나 5xx를 낸다. 응답 경로에서는
 * 이 실패가 30초짜리 degraded 캐시로 흡수되지만, **진단 경로는 결과를 영구 저장한다.**
 * 한 번의 일시 실패가 그 진단 기록에 영원히 남는다.
 *
 * 그래서 재시도는 기본값이 아니라 **호출부가 켜는 옵션**이다. 진단은 하루 몇 건
 * 수준이라 지연보다 완결성이 중요하고, 응답 경로는 그 반대다 — 외부 API가 느릴 때
 * 모든 사용자의 지연이 배로 늘어난다.
 *
 * 예외를 던지지 않는 클라이언트(실패해도 빈 값을 돌려준다)를 위해, 재시도 여부는
 * 예외가 아니라 `shouldRetry`가 결과를 보고 판단한다.
 */
export interface RetryOptions<T> {
  /** 재시도 횟수. 0이면 한 번만 호출한다(기본값). */
  retries?: number;
  /** 재시도 사이 대기(ms). 정부 API의 순간 부하를 피하려 짧게 둔다. */
  delayMs?: number;
  /** 결과를 보고 재시도할지 정한다. */
  shouldRetry: (result: T) => boolean;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions<T>,
): Promise<T> {
  const retries = options.retries ?? 0;
  const delayMs = options.delayMs ?? 300;

  let result = await operation();
  for (let attempt = 0; attempt < retries && options.shouldRetry(result); attempt++) {
    await sleep(delayMs);
    result = await operation();
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
