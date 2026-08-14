import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAsyncJob } from '../../hooks/useAsyncJob';
import { useUserLocation } from '../../hooks/useUserLocation';
import {
  AsyncState,
  emptyState,
  errorState,
  loadingState,
  successState,
} from '../../lib/async-state';
import type { CarePlan, CarePlanFastResponse, CareType } from '../../types';

/** fast-path 잡 결과 `{ plan, source: 'LIVE' }`에서 plan을 꺼낸다(0/1개 배열로 감싸서). */
function unwrapCarePlan(result: unknown): CarePlan[] {
  const plan = (result as { plan?: CarePlan } | null)?.plan;
  return plan ? [plan] : [];
}

interface UseCarePlanOptions {
  careType: CareType;
  /**
   * skin/combined/morning에 필요. weather는 좌표만 쓴다. morning은 diagnosisId(피부)와
   * 좌표(오늘 실시간 날씨) 둘 다 쓴다. null/undefined면 "아직 진단 없음"으로 본다.
   */
  diagnosisId?: string | null;
}

const NEEDS_COORDS: readonly CareType[] = ['weather', 'morning'];
const NEEDS_DIAGNOSIS: readonly CareType[] = ['skin', 'combined', 'morning'];

/**
 * 케어 루틴+제품 화면 상태 — useWeatherProducts/useHomeDashboard와 같은 R27 패턴.
 * `reload`는 화면 진입/당겨서 갱신용(직전 결과 재사용 가능), `refresh`는 사용자가
 * "다른 제품 보여줘"를 눌렀을 때용(서버가 캐시를 무시하고 새로 생성).
 */
export function useCarePlan({ careType, diagnosisId }: UseCarePlanOptions) {
  const { coords, loading: locationLoading } = useUserLocation();
  const [state, setState] = useState<AsyncState<CarePlan>>(loadingState);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const { refreshing: liveRefreshing, watch, cancel } = useAsyncJob<CarePlan>(unwrapCarePlan);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchPlan = useCallback(
    (refresh?: boolean): Promise<CarePlanFastResponse | null> => {
      if (careType === 'weather') {
        return api.getCareWeatherFast({ coords: coords ?? undefined, refresh });
      }
      if (!diagnosisId) return Promise.resolve(null);
      if (careType === 'morning') {
        return api.getCareMorningFast(diagnosisId, { coords: coords ?? undefined, refresh });
      }
      return careType === 'skin'
        ? api.getCareSkinFast(diagnosisId, refresh)
        : api.getCareCombinedFast(diagnosisId, refresh);
    },
    [careType, coords, diagnosisId],
  );

  const load = useCallback(
    async (refresh?: boolean) => {
      cancel();
      if (NEEDS_DIAGNOSIS.includes(careType) && !diagnosisId) {
        // 촬영 기록이 아직 없음 — 에러가 아니라 "빈 상태"로 화면이 촬영 유도를 보여준다.
        setState(emptyState);
        return;
      }
      const response = await fetchPlan(refresh);
      if (!mountedRef.current) return;
      setState(response ? successState(response.plan) : errorState);
      watch(response, (items) => {
        if (items[0]) setState(successState(items[0]));
      });
    },
    [careType, diagnosisId, fetchPlan, watch, cancel],
  );

  useEffect(() => {
    if (NEEDS_COORDS.includes(careType) && locationLoading) return;
    setState(loadingState);
    void load();
    // diagnosisId/careType이 바뀌면(탭 전환) 새로 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careType, diagnosisId, locationLoading]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mountedRef.current) setRefreshing(false);
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    if (mountedRef.current) setRefreshing(false);
  }, [load]);

  return {
    state,
    /** 당겨서 갱신 / 재진입 중 */
    refreshing,
    /** 잡이 끝나 더 좋은 결과로 바뀌기를 기다리는 중 */
    liveRefreshing,
    reload,
    /** "다른 제품 보여줘" — 서버가 exclude 세션을 적용해 새로 생성한다. */
    refresh,
  };
}
