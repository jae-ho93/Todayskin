import { act } from 'react-test-renderer';
import { api } from '../../../api/client';
import { flush, renderHook } from '../../../test-utils/renderHook';
import { useHomeDashboard } from '../useHomeDashboard';
import type { Recommendation, SkinScoreSnapshot, WeatherSnapshot } from '../../../types';

/**
 * R27: 홈 화면이 직접 들고 있던 로드 순서·병합 규칙을 훅으로 옮기면서 고정한다.
 * 특히 "촬영 기록 없음"(empty)과 "조회 실패"(error)의 구분이 화면 분기의 근거다.
 */

jest.mock('../../../hooks/useUserLocation', () => ({
  useUserLocation: () => ({ coords: null, permissionDenied: false, loading: false }),
}));

const weather: WeatherSnapshot = {
  observedAt: '2026-08-12T09:00:00.000Z',
  regionName: '서울특별시',
};

const skinScore: SkinScoreSnapshot = {
  id: 'diag-1',
  capturedAt: '2026-08-12T13:00:00.000Z',
  overallScore: 72,
  parts: [],
};

function recommendation(id: string): Recommendation {
  return {
    id,
    title: `추천 ${id}`,
    grade: 'A',
    sourceLabel: '가이드라인',
    sources: [],
    explanation: '설명',
    ingredientTags: [],
    relatedProductIds: [],
  };
}

beforeEach(() => {
  jest.spyOn(api, 'getWeather').mockResolvedValue({ status: 'ok', data: weather });
  jest.spyOn(api, 'getSkinScore').mockResolvedValue({ status: 'ok', data: skinScore });
  jest.spyOn(api, 'getRecommendations').mockResolvedValue({ status: 'ok', data: [] });
  jest.spyOn(api, 'generateRecommendationsFast').mockResolvedValue(null);
  jest.spyOn(api, 'waitForJob').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useHomeDashboard', () => {
  it('아직 촬영한 적이 없으면 스코어·추천이 empty다 (실패가 아니다)', async () => {
    jest.spyOn(api, 'getSkinScore').mockResolvedValue({ status: 'not_found' });

    const { result } = renderHook(() => useHomeDashboard());
    await flush();

    expect(result.current.skin.status).toBe('empty');
    expect(result.current.recommendations.status).toBe('empty');
    expect(api.generateRecommendationsFast).not.toHaveBeenCalled();
  });

  it('첫 조회부터 스코어가 실패하면 스코어·추천이 error다', async () => {
    jest.spyOn(api, 'getSkinScore').mockResolvedValue({ status: 'error' });

    const { result } = renderHook(() => useHomeDashboard());
    await flush();

    expect(result.current.skin.status).toBe('error');
    expect(result.current.recommendations.status).toBe('error');
  });

  // F52: 값을 이미 보여주는 중이면 일시적 실패로 지우지 않는다 — 화면이 값과
  // "불러올 수 없어요"를 동시에 띄우거나 카드가 사라지는 걸 막는다.
  it('이미 스코어를 보여주고 있으면 갱신 실패로 지우지 않고 알리기만 한다', async () => {
    const onRefreshFailed = jest.fn();
    const { result } = renderHook(() => useHomeDashboard({ onRefreshFailed }));
    await flush();
    expect(result.current.skin.status).toBe('success');

    jest.spyOn(api, 'getSkinScore').mockResolvedValue({ status: 'error' });
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.skin).toEqual({ status: 'success', data: skinScore });
    expect(onRefreshFailed).toHaveBeenCalled();
  });

  it('갱신 중에는 이미 보여주던 값을 로딩으로 되돌리지 않는다', async () => {
    const { result } = renderHook(() => useHomeDashboard());
    await flush();
    expect(result.current.weather.status).toBe('success');

    // 갱신 응답을 붙잡아 둔 채로 "갱신 중" 시점의 상태를 관찰한다.
    let releaseWeather = () => {};
    jest.spyOn(api, 'getWeather').mockReturnValue(
      new Promise((resolve) => {
        releaseWeather = () => resolve({ status: 'ok', data: weather });
      }),
    );

    let reloading: Promise<void> = Promise.resolve();
    act(() => {
      reloading = result.current.reload();
    });
    await flush();

    expect(result.current.weather).toEqual({ status: 'success', data: weather });
    expect(result.current.recommendations.status).toBe('success');

    await act(async () => {
      releaseWeather();
      await reloading;
    });
  });

  it('날씨 조회 실패는 스코어·추천에 영향을 주지 않는다', async () => {
    jest.spyOn(api, 'getWeather').mockResolvedValue({ status: 'error' });

    const { result } = renderHook(() => useHomeDashboard());
    await flush();

    expect(result.current.weather.status).toBe('error');
    expect(result.current.skin.status).toBe('success');
  });

  it('A등급과 fast-path 결과를 이어 붙인다', async () => {
    jest
      .spyOn(api, 'getRecommendations')
      .mockResolvedValue({ status: 'ok', data: [recommendation('a1')] });
    jest.spyOn(api, 'generateRecommendationsFast').mockResolvedValue({
      source: 'LIVE',
      recommendations: [recommendation('b1')],
    });

    const { result } = renderHook(() => useHomeDashboard());
    await flush();

    expect(result.current.recommendations).toEqual({
      status: 'success',
      data: [recommendation('a1'), recommendation('b1')],
    });
  });

  it('A·B 양쪽 다 실패해야 추천이 error다 — 한쪽만 오면 그걸 보여준다', async () => {
    jest.spyOn(api, 'getRecommendations').mockResolvedValue({ status: 'error' });
    jest.spyOn(api, 'generateRecommendationsFast').mockResolvedValue(null);

    const { result } = renderHook(() => useHomeDashboard());
    await flush();

    expect(result.current.recommendations.status).toBe('error');
  });

  it('CACHED 응답이면 잡 결과가 오는 대로 B등급만 교체하고 A등급은 남긴다', async () => {
    jest
      .spyOn(api, 'getRecommendations')
      .mockResolvedValue({ status: 'ok', data: [recommendation('a1')] });
    jest.spyOn(api, 'generateRecommendationsFast').mockResolvedValue({
      source: 'CACHED',
      jobId: 'job-1',
      recommendations: [recommendation('stale')],
    });
    jest.spyOn(api, 'waitForJob').mockResolvedValue({
      id: 'job-1',
      status: 'COMPLETED',
      type: 'RECOMMENDATION_GENERATE',
      result: { recommendations: [recommendation('live')] },
      createdAt: '2026-08-12T00:00:00.000Z',
    });

    const { result } = renderHook(() => useHomeDashboard());
    await flush();
    await flush();

    expect(result.current.recommendations).toEqual({
      status: 'success',
      data: [recommendation('a1'), recommendation('live')],
    });
    expect(result.current.liveRefreshing).toBe(false);
  });
});
