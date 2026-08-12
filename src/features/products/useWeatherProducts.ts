import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAsyncJob, unwrapJobItems } from '../../hooks/useAsyncJob';
import { useUserLocation } from '../../hooks/useUserLocation';
import {
  AsyncState,
  errorState,
  loadingState,
  successState,
} from '../../lib/async-state';
import type { Product } from '../../types';

/**
 * R27: 제품 화면의 서버 상태.
 *
 * 화면은 "무엇을 그릴지"만 정하고, 언제 무엇을 부르는지는 여기서 관리한다.
 */
export function useWeatherProducts() {
  const { coords, loading: locationLoading } = useUserLocation();
  const [state, setState] = useState<AsyncState<Product[]>>(loadingState);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const { refreshing: liveRefreshing, watch } = useAsyncJob<Product>(
    unwrapJobItems('products'),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    // N12: 날씨는 서버가 직접 조회한다. 클라이언트는 좌표만 전달하고 weather 본문을
    // 보내지 않으므로 조작된 날씨로 추천을 왜곡할 수 없다.
    const response = await api.getWeatherProductsFast(coords ?? undefined);
    if (!mountedRef.current) return;

    setState(response ? successState(response.items ?? []) : errorState);
    watch(response, (items) => setState(successState(items)));
  }, [coords, watch]);

  useEffect(() => {
    if (locationLoading) return;
    setState(loadingState);
    void load();
  }, [locationLoading, load]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mountedRef.current) setRefreshing(false);
  }, [load]);

  return {
    state,
    /** 당겨서 갱신 중 */
    refreshing,
    /** 잡이 끝나 더 좋은 추천으로 바뀌기를 기다리는 중 */
    liveRefreshing,
    reload,
  };
}
