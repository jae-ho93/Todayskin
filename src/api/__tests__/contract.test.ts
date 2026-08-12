import { api } from '../client';
import * as session from '../../lib/session';
import type {
  NotificationPreferences,
  Product,
  Recommendation,
  WeatherSnapshot,
} from '../../types';

/**
 * R16: 백엔드 `test/api-contract.e2e-spec.ts`와 짝을 이루는 프론트 계약 테스트.
 * 백엔드가 실제로 내려주는 형태의 응답을 그대로 통과시켜, 클라이언트가 선언된 타입으로
 * 손실 없이 넘겨주는지 확인한다. 응답 래핑(items/recommendations)이 어긋나면 여기서 깨진다.
 */

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit?]>;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(session, 'getToken').mockResolvedValue('access-1');
});

describe('GET /weather 계약', () => {
  it('정부 API 전체 실패 응답(모든 지표 null + UNAVAILABLE)을 null 그대로 전달한다', async () => {
    // 백엔드 계약: 목업으로 채우지 않고 null + source=UNAVAILABLE을 내려준다.
    const payload: WeatherSnapshot = {
      observedAt: '2026-08-12T09:00:00.000Z',
      regionName: '서울특별시',
      districtName: '종로구',
      source: 'UNAVAILABLE',
      uvIndex: null,
      uvStatus: null,
      pm25: null,
      pm10: null,
      ozonePpm: null,
      caiValue: null,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, payload));

    const result = await api.getWeather({ latitude: 37.5665, longitude: 126.978 });

    expect(result).toEqual({ status: 'ok', data: payload });
    // 0으로 뭉개지 않아야 한다 — 화면이 "측정 불가"와 "0"을 구분한다.
    expect(result.status === 'ok' && result.data.uvIndex).toBeNull();
    expect(result.status === 'ok' && result.data.source).toBe('UNAVAILABLE');
  });

  it('좌표를 쿼리스트링으로 보낸다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await api.getWeather({ latitude: 37.5665, longitude: 126.978 });

    expect(fetchMock.mock.calls[0][0]).toContain('/weather?lat=37.5665&lon=126.978');
  });

  // R14: 실패를 null로 뭉개면 화면이 "측정 불가"와 "조회 실패"를 구분할 수 없다.
  it('5xx면 목업이 아니라 error 상태를 반환한다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { detail: 'unavailable' }));

    await expect(api.getWeather()).resolves.toEqual({ status: 'error' });
  });

  it('네트워크 오류도 error 상태로 돌려준다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network request failed'));

    await expect(api.getWeather()).resolves.toEqual({ status: 'error' });
  });

  // R14: safeFetch를 없애고 authFetch 한 경로로 합쳤으므로, 인증이 필수가 아닌
  // 엔드포인트도 토큰이 있으면 헤더를 싣는다.
  it('토큰이 있으면 Authorization 헤더를 함께 보낸다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await api.getWeather();

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-1');
  });

  it('토큰이 없으면 Authorization 헤더 없이 보낸다', async () => {
    jest.spyOn(session, 'getToken').mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await api.getWeather();

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('추천·제품 응답 스키마 계약', () => {
  const recommendation: Recommendation = {
    id: 'rec-1',
    title: '오늘은 이중 세안을 권장해요',
    grade: 'A',
    sourceLabel: '기상청·WHO 자외선 권고',
    sources: [
      {
        id: 'who-uv-index-2002',
        title: 'Global Solar UV Index: A Practical Guide',
        publisher: 'World Health Organization',
        year: 2002,
        url: 'https://www.who.int/publications/i/item/9241590076',
      },
    ],
    explanation: '미세먼지 농도가 높아 잔여물 제거가 필요해요',
    ingredientTags: ['판테놀'],
    relatedProductIds: ['prod-1'],
    timing: '외출 후',
  };

  const product: Product = {
    id: 'prod-1',
    name: '수분 크림',
    brand: '테스트브랜드',
    matchedGrade: 'B',
    matchedIngredients: ['히알루론산'],
    category: 'moisture',
  };

  it('GET /recommendations는 배열을 그대로 전달한다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [recommendation]));

    await expect(api.getRecommendations('A')).resolves.toEqual({
      status: 'ok',
      data: [recommendation],
    });
    expect(fetchMock.mock.calls[0][0]).toContain('/recommendations?grade=A');
  });

  it('GET /products는 카탈로그 배열을 전달한다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [product]));

    const result = await api.getProducts('moisture');

    expect(result.status === 'ok' && result.data[0].matchedGrade).toBe('B');
    expect(fetchMock.mock.calls[0][0]).toContain('/products?category=moisture');
  });

  it('추천 fast path는 recommendations 키로 래핑돼 온다', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        source: 'FALLBACK',
        jobId: 'job-1',
        recommendations: [recommendation],
      }),
    );

    const res = await api.generateRecommendationsFast('diag-1');

    expect(res?.source).toBe('FALLBACK');
    expect(res?.jobId).toBe('job-1');
    expect(res?.recommendations).toEqual([recommendation]);
  });

  it('날씨 제품 fast path는 items 키로 래핑돼 온다 (recommendations 아님)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { source: 'CACHED', items: [product] }),
    );

    const res = await api.getWeatherProductsFast({ latitude: 37.5, longitude: 127 });

    expect(res?.items).toEqual([product]);
    expect(fetchMock.mock.calls[0][0]).toContain('/products/weather-based');
  });

  it('job 결과는 { recommendations: [...] } 래핑 객체로 온다', async () => {
    // SSE 스트리밍(body.getReader)을 지원하지 않는 응답 → 폴링 폴백.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 'job-1',
          status: 'COMPLETED',
          type: 'RECOMMENDATION_GENERATE',
          result: { recommendations: [recommendation] },
          createdAt: '2026-08-12T09:00:00.000Z',
        }),
      );

    const job = await api.waitForJob<{ recommendations: Recommendation[] }>('job-1');

    expect(job?.status).toBe('COMPLETED');
    expect(job?.result?.recommendations).toEqual([recommendation]);
  });

  it('FAILED job도 결과로 돌려준다 (호출부가 기존 데이터를 유지하도록)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(
      jsonResponse(200, {
        id: 'job-1',
        status: 'FAILED',
        type: 'RECOMMENDATION_GENERATE',
        error: 'gemini timeout',
        createdAt: '2026-08-12T09:00:00.000Z',
      }),
    );

    const job = await api.waitForJob('job-1');

    expect(job?.status).toBe('FAILED');
    expect(job?.error).toBe('gemini timeout');
  });

  it('호출부가 취소하면 요청 없이 null을 반환한다', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(api.waitForJob('job-1', { signal: controller.signal })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('설정·프로필 응답 계약', () => {
  it('알림 설정은 row가 없어도 기본값 객체로 온다 (404 아님)', async () => {
    const prefs: NotificationPreferences = {
      userId: 1,
      pushEnabled: false,
      uvAlertEnabled: true,
      dustAlertEnabled: true,
      morningReminder: false,
      pushDeliveryAvailable: false,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, prefs));

    await expect(api.getNotificationPreferences()).resolves.toEqual(prefs);
  });

  it('패턴 분석은 데이터 부족 시 LOCKED 상태로 온다 (null 아님)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: 'LOCKED',
        collectedDays: 3,
        requiredDays: 14,
        lockedMessage: '아직 데이터가 부족해요',
        correlations: [],
        recommendationIds: [],
      }),
    );

    const pattern = await api.getPattern();

    expect(pattern?.status).toBe('LOCKED');
    expect(pattern?.correlations).toEqual([]);
  });

  it('PATCH /auth/me로 프로필을 부분 갱신한다', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        id: 1,
        phoneNumber: '01012345678',
        name: '새이름',
        birthDate: '1990-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        accessToken: 'access-1',
      }),
    );

    const user = await api.updateMe({ name: '새이름' });

    expect(user.name).toBe('새이름');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('PATCH');
  });
});
