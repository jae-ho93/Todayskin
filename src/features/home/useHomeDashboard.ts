import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAsyncJob, unwrapJobItems } from '../../hooks/useAsyncJob';
import { useUserLocation } from '../../hooks/useUserLocation';
import {
  AsyncState,
  emptyState,
  errorState,
  loadingState,
  successState,
} from '../../lib/async-state';
import type { Recommendation, SkinScoreSnapshot, WeatherSnapshot } from '../../types';

interface UseHomeDashboardOptions {
  /**
   * 이미 화면에 데이터가 있는 상태에서 갱신이 실패했을 때 불린다.
   * 이 경우 기존 데이터를 지우지 않으므로(블랭크 방지) 화면이 토스트로만 알린다.
   */
  onRefreshFailed?: () => void;
}

/**
 * R27: 홈 대시보드의 서버 상태 — 날씨 · 피부 스코어 · 추천.
 *
 * 화면이 useState 8개로 들고 있던 것을 값별 AsyncState 3개로 묶었다.
 * `skin`의 `empty`는 "아직 한 번도 촬영하지 않음"이고 `error`는 "조회 실패"다.
 * 이 둘을 구분해야 촬영 유도와 재시도를 각각 보여줄 수 있다.
 */
export function useHomeDashboard({ onRefreshFailed }: UseHomeDashboardOptions = {}) {
  const { coords, loading: locationLoading } = useUserLocation();
  const [weather, setWeather] = useState<AsyncState<WeatherSnapshot>>(loadingState);
  const [skin, setSkin] = useState<AsyncState<SkinScoreSnapshot>>(loadingState);
  const [recommendations, setRecommendations] =
    useState<AsyncState<Recommendation[]>>(loadingState);
  const [refreshing, setRefreshing] = useState(false);

  const { refreshing: liveRefreshing, watch, cancel } = useAsyncJob<Recommendation>(
    unwrapJobItems('recommendations'),
  );

  // F52: in-flight 가드·최초 로드 완료·기존 데이터 유무 마커
  // (새로고침 버튼·당겨서 갱신·포커스 자동 갱신 중복 호출 방지 + 오류 시 화면 유지)
  const loadInFlightRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const hasDataRef = useRef(false);
  const mountedRef = useRef(true);
  const onRefreshFailedRef = useRef(onRefreshFailed);
  onRefreshFailedRef.current = onRefreshFailed;
  // 갱신 실패 시 "지울지 유지할지"를 판단하려면 직전 값을 setState 업데이터 밖에서 읽어야 한다.
  const skinRef = useRef(skin);
  skinRef.current = skin;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    // F52: 이미 갱신 중이면 중복 호출을 차단한다 (무한 폴링/시간 밀림 방지).
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    try {
      cancel();
      // F52: 이미 보여주고 있는 값은 로딩으로 되돌리지 않는다. 갱신이 실패해도 화면이
      // 스피너로 바뀌지 않고 직전 정보를 유지해야 한다.
      setWeather((prev) => (prev.status === 'success' ? prev : loadingState));
      setRecommendations((prev) => (prev.status === 'success' ? prev : loadingState));

      const weatherResult = await api.getWeather(coords ?? undefined);
      if (!mountedRef.current) return;
      setWeather(weatherResult.status === 'ok' ? successState(weatherResult.data) : errorState);
      hasDataRef.current = true;

      const skinResult = await api.getSkinScore();
      if (!mountedRef.current) return;

      if (skinResult.status === 'not_found') {
        setSkin(emptyState);
        setRecommendations(emptyState);
        return;
      }
      if (skinResult.status === 'error') {
        // F52: 이미 보여주고 있던 스코어는 일시적 실패로 지우지 않는다. 화면이 값과
        // "불러올 수 없어요"를 동시에 띄우는 모순을 피하려고 토스트로만 알린다.
        if (skinRef.current.status === 'success') {
          onRefreshFailedRef.current?.();
        } else {
          setSkin(errorState);
          setRecommendations(errorState);
        }
        return;
      }
      setSkin(successState(skinResult.data));

      // A등급(공인 가이드라인)은 날씨만으로 즉시 판단하고, B등급은 서버가 소유권을 확인한 뒤
      // 저장된 피부·날씨 데이터로 생성한다.
      const [aGradeResult, fastResponse] = await Promise.all([
        api.getRecommendations('A'),
        api.generateRecommendationsFast(skinResult.data.id),
      ]);
      if (!mountedRef.current) return;

      const aGrade = aGradeResult.status === 'ok' ? aGradeResult.data : null;
      const bGrade = fastResponse?.recommendations ?? null;
      // 양쪽 다 실패했을 때만 실패로 본다. 한쪽이라도 왔으면 그걸 보여준다.
      setRecommendations(
        aGrade === null && bGrade === null
          ? errorState
          : successState([...(aGrade ?? []), ...(bGrade ?? [])]),
      );

      // fast 응답이 CACHED/FALLBACK이면 잡이 끝나는 대로 B등급만 LIVE 결과로 갈아끼운다.
      watch(fastResponse, (live) => {
        setRecommendations(successState([...(aGrade ?? []), ...live]));
      });
    } catch {
      if (!mountedRef.current) return;
      // F52: 오류 시 기존 데이터 유지 — 화면 블랭크/무한 스피너 방지.
      if (hasDataRef.current) {
        onRefreshFailedRef.current?.();
      } else {
        // 아직 아무것도 못 받은 상태라면 로딩 스피너가 영원히 남지 않게 전부 오류로 내린다.
        setWeather((prev) => (prev.status === 'success' ? prev : errorState));
        setSkin(errorState);
        setRecommendations(errorState);
      }
    } finally {
      loadInFlightRef.current = false;
      initialLoadDoneRef.current = true;
    }
  }, [coords, cancel, watch]);

  // 첫 진입 로드 — 위치 권한 응답(허용/거부)이 결정될 때까지 기다린다. 거부돼도 coords만
  // 없을 뿐 서버가 기본 지역으로 폴백하므로 화면은 그대로 진행된다.
  useEffect(() => {
    if (locationLoading) return;
    void load();
  }, [locationLoading, load]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mountedRef.current) setRefreshing(false);
  }, [load]);

  /** F52: 화면 포커스 복귀 시 갱신 — 첫 진입은 위 effect가 처리하므로 건너뛴다. */
  const reloadOnFocus = useCallback(() => {
    if (!initialLoadDoneRef.current) return;
    void load();
  }, [load]);

  return {
    weather,
    skin,
    recommendations,
    /** 잡이 끝나 최신 추천으로 바뀌기를 기다리는 중 */
    liveRefreshing,
    /** 당겨서 갱신·새로고침 버튼 진행 중 */
    refreshing,
    reload,
    reloadOnFocus,
  };
}
