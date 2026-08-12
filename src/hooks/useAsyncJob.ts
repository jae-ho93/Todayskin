import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

/**
 * fast-path 응답의 공통 형태 — 즉시 쓸 결과와, 더 좋은 결과를 만들고 있는 잡의 id.
 * source가 'LIVE'면 이미 최종 결과이므로 기다릴 잡이 없다.
 */
export interface FastPathResponse {
  source: 'CACHED' | 'FALLBACK' | 'LIVE';
  jobId?: string;
}

/**
 * R27: fast-path → 잡 대기 → 결과 교체 오케스트레이션.
 *
 * 홈(추천)과 제품 화면이 이 흐름을 각자 한 벌씩 들고 있었다. 타이밍·취소가 얽힌
 * 코드라 버그가 나기 쉬운데 두 벌을 따로 고쳐야 했고, 실제로 언마운트 시 abort 처리가
 * 서로 달랐다. 여기 한 곳으로 모은다.
 *
 * `unwrap`은 잡 결과 페이로드에서 배열을 꺼내는 함수다. 서버가 도메인마다 다른 키로
 * 감싸서 내려주기 때문에(`{ recommendations: [...] }` / `{ products: [...] }`)
 * 호출부가 알려준다.
 */
export function useAsyncJob<T>(unwrap: (result: unknown) => T[]) {
  // 잡이 끝나 더 좋은 결과로 바뀌기를 기다리는 중인지. 화면은 기존 결과를 계속 보여주면서
  // "갱신 중"만 덧붙인다.
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const unwrapRef = useRef(unwrap);
  unwrapRef.current = unwrap;

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (mountedRef.current) setRefreshing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  /**
   * fast 응답을 넘기면 LIVE 교체가 필요한 경우에만 잡을 기다린다.
   * 이전 대기가 남아 있으면 취소하므로, 화면은 매 로드마다 그냥 호출하면 된다.
   *
   * 잡이 실패·타임아웃·취소되면 `onLive`를 부르지 않는다 — 이미 보여주고 있는
   * CACHED/FALLBACK 결과를 유지하는 게 빈 화면보다 낫기 때문이다.
   */
  const watch = useCallback(
    (response: FastPathResponse | null | undefined, onLive: (items: T[]) => void) => {
      abortRef.current?.abort();
      abortRef.current = null;

      if (!response || response.source === 'LIVE' || !response.jobId) {
        if (mountedRef.current) setRefreshing(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setRefreshing(true);

      // SSE 우선, 실패 시 폴링 폴백 — waitForJob 내부에서 처리 (F0)
      void api.waitForJob(response.jobId, { signal: controller.signal }).then((job) => {
        if (abortRef.current === controller) abortRef.current = null;
        // 취소된 대기의 결과는 버린다 — 다음 로드가 이미 화면을 갱신했을 수 있다.
        if (controller.signal.aborted || !mountedRef.current) return;
        if (job?.status === 'COMPLETED' && job.result) {
          onLive(unwrapRef.current(job.result));
        }
        setRefreshing(false);
      });
    },
    [],
  );

  return { refreshing, watch, cancel };
}

/** `{ <key>: [...] }`로 감싸 오는 잡 결과에서 배열을 꺼낸다 (F38). */
export function unwrapJobItems<T>(key: string) {
  return (result: unknown): T[] => {
    const items = (result as Record<string, unknown> | null)?.[key];
    return Array.isArray(items) ? (items as T[]) : [];
  };
}
