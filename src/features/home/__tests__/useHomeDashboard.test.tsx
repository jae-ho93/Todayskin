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

  it('스코어 조회가 실패하면 스코어·추천이 error다', async () => {
    jest.spyOn(api, 'getSkinScore').mockResolvedValue({ status: 'error' });

    const { result } = renderHook(() => useHomeDashboard());
    await flush();

    expect(result.current.skin.status).toBe('error');
    expect(result.current.recommendations.status).toBe('error');
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
