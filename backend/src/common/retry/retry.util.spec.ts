import { withRetry } from './retry.util';

/**
 * N42: 진단 스냅샷의 대기질이 일시 실패로 영구히 비었던 문제의 대응.
 *
 * 날씨 클라이언트들은 실패해도 예외를 던지지 않고 빈 값을 돌려준다. 그래서
 * 재시도 판단은 예외가 아니라 **결과를 보고** 해야 한다.
 */
describe('withRetry', () => {
  const noDelay = { delayMs: 0 };

  it('성공하면 재시도하지 않는다', async () => {
    const operation = jest.fn().mockResolvedValue({ failed: false });

    const result = await withRetry(operation, {
      ...noDelay,
      retries: 1,
      shouldRetry: (r: { failed: boolean }) => r.failed,
    });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(false);
  });

  it('실패하면 재시도하고, 성공한 결과를 돌려준다', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce({ failed: true })
      .mockResolvedValueOnce({ failed: false, value: 5 });

    const result = await withRetry(operation, {
      ...noDelay,
      retries: 1,
      shouldRetry: (r: { failed: boolean }) => r.failed,
    });

    expect(operation).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ failed: false, value: 5 });
  });

  it('재시도 횟수를 넘기지 않는다', async () => {
    const operation = jest.fn().mockResolvedValue({ failed: true });

    const result = await withRetry(operation, {
      ...noDelay,
      retries: 2,
      shouldRetry: (r: { failed: boolean }) => r.failed,
    });

    expect(operation).toHaveBeenCalledTimes(3); // 최초 1 + 재시도 2
    expect(result.failed).toBe(true);
  });

  // 응답 경로의 기본값. 외부 API가 느릴 때 모든 사용자의 지연이 배로 늘어나면 안 된다.
  it('retries 기본값은 0이라 한 번만 호출한다', async () => {
    const operation = jest.fn().mockResolvedValue({ failed: true });

    await withRetry(operation, {
      ...noDelay,
      shouldRetry: (r: { failed: boolean }) => r.failed,
    });

    expect(operation).toHaveBeenCalledTimes(1);
  });

  /**
   * "값 없음"과 "수집 실패"를 가르는 지점. 측정소가 값을 안 냈을 뿐이면
   * 몇 번을 더 불러도 결과가 같아서, 정부 API 호출만 낭비한다.
   */
  it('재시도해도 소용없는 결과는 다시 부르지 않는다', async () => {
    const operation = jest.fn().mockResolvedValue({ failed: false, value: null });

    await withRetry(operation, {
      ...noDelay,
      retries: 2,
      shouldRetry: (r: { failed: boolean }) => r.failed,
    });

    expect(operation).toHaveBeenCalledTimes(1);
  });
});
