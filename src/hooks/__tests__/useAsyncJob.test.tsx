import { act } from 'react-test-renderer';
import { api } from '../../api/client';
import { flush, renderHook } from '../../test-utils/renderHook';
import { unwrapJobItems, useAsyncJob } from '../useAsyncJob';
import type { Job } from '../../types';

/**
 * R27: 잡 오케스트레이션은 타이밍·취소가 얽혀 버그가 나기 쉬운데 두 화면에 복사돼 있었고
 * 테스트가 없었다. 훅으로 합치면서 그 규칙을 여기에 고정한다.
 */

type Item = { id: string };

function completed(items: Item[]): Job<unknown> {
  return {
    id: 'job-1',
    status: 'COMPLETED',
    type: 'RECOMMENDATION_GENERATE',
    result: { items },
    createdAt: '2026-08-12T00:00:00.000Z',
  };
}

let waitForJobMock: jest.SpyInstance;

beforeEach(() => {
  waitForJobMock = jest.spyOn(api, 'waitForJob');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useAsyncJob', () => {
  it('LIVE 응답이면 잡을 기다리지 않는다 — 이미 최종 결과다', () => {
    const { result } = renderHook(() => useAsyncJob<Item>(unwrapJobItems('items')));
    const onLive = jest.fn();

    act(() => {
      result.current.watch({ source: 'LIVE', jobId: 'job-1' }, onLive);
    });

    expect(waitForJobMock).not.toHaveBeenCalled();
    expect(result.current.refreshing).toBe(false);
    expect(onLive).not.toHaveBeenCalled();
  });

  it('jobId가 없으면 기다리지 않는다', () => {
    const { result } = renderHook(() => useAsyncJob<Item>(unwrapJobItems('items')));

    act(() => {
      result.current.watch({ source: 'FALLBACK' }, jest.fn());
    });

    expect(waitForJobMock).not.toHaveBeenCalled();
    expect(result.current.refreshing).toBe(false);
  });

  it('CACHED 응답이면 잡을 기다렸다가 LIVE 결과로 교체한다', async () => {
    waitForJobMock.mockResolvedValue(completed([{ id: 'live-1' }]));
    const { result } = renderHook(() => useAsyncJob<Item>(unwrapJobItems('items')));
    const onLive = jest.fn();

    act(() => {
      result.current.watch({ source: 'CACHED', jobId: 'job-1' }, onLive);
    });
    expect(result.current.refreshing).toBe(true);

    await flush();

    expect(onLive).toHaveBeenCalledWith([{ id: 'live-1' }]);
    expect(result.current.refreshing).toBe(false);
  });

  it('잡이 실패하면 콜백을 부르지 않는다 — 기존 결과를 유지한다', async () => {
    waitForJobMock.mockResolvedValue({
      id: 'job-1',
      status: 'FAILED',
      type: 'RECOMMENDATION_GENERATE',
      error: 'boom',
      createdAt: '2026-08-12T00:00:00.000Z',
    } satisfies Job<unknown>);
    const { result } = renderHook(() => useAsyncJob<Item>(unwrapJobItems('items')));
    const onLive = jest.fn();

    act(() => {
      result.current.watch({ source: 'FALLBACK', jobId: 'job-1' }, onLive);
    });
    await flush();

    expect(onLive).not.toHaveBeenCalled();
    expect(result.current.refreshing).toBe(false);
  });

  it('다시 watch하면 이전 대기를 취소하고 그 결과는 버린다', async () => {
    let resolveFirst: ((job: Job<unknown> | null) => void) | undefined;
    waitForJobMock
      .mockImplementationOnce(
        () =>
          new Promise<Job<unknown> | null>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(completed([{ id: 'second' }]));

    const { result } = renderHook(() => useAsyncJob<Item>(unwrapJobItems('items')));
    const onFirst = jest.fn();
    const onSecond = jest.fn();

    act(() => {
      result.current.watch({ source: 'CACHED', jobId: 'job-1' }, onFirst);
    });
    act(() => {
      result.current.watch({ source: 'CACHED', jobId: 'job-2' }, onSecond);
    });

    // 취소된 첫 대기가 뒤늦게 끝나도 화면을 되돌리면 안 된다.
    resolveFirst?.(completed([{ id: 'first' }]));
    await flush();

    expect(onSecond).toHaveBeenCalledWith([{ id: 'second' }]);
    expect(onFirst).not.toHaveBeenCalled();
  });

  it('언마운트되면 대기를 중단하고 콜백을 부르지 않는다', async () => {
    let resolveJob: ((job: Job<unknown> | null) => void) | undefined;
    waitForJobMock.mockImplementation(
      () =>
        new Promise<Job<unknown> | null>((resolve) => {
          resolveJob = resolve;
        }),
    );

    const { result, unmount } = renderHook(() =>
      useAsyncJob<Item>(unwrapJobItems('items')),
    );
    const onLive = jest.fn();

    act(() => {
      result.current.watch({ source: 'CACHED', jobId: 'job-1' }, onLive);
    });
    unmount();

    resolveJob?.(completed([{ id: 'late' }]));
    await flush();

    expect(onLive).not.toHaveBeenCalled();
  });
});

describe('unwrapJobItems', () => {
  it('래핑 키에서 배열을 꺼낸다', () => {
    expect(unwrapJobItems<Item>('products')({ products: [{ id: 'p1' }] })).toEqual([
      { id: 'p1' },
    ]);
  });

  it('키가 없거나 배열이 아니면 빈 배열을 준다', () => {
    expect(unwrapJobItems<Item>('products')({})).toEqual([]);
    expect(unwrapJobItems<Item>('products')(null)).toEqual([]);
    expect(unwrapJobItems<Item>('products')({ products: 'nope' })).toEqual([]);
  });
});
