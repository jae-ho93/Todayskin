import { ConfigService } from '@nestjs/config';
import { EvidencePolicy } from './evidence.policy';
import { OpenAiClient, OpenAiUnavailable } from './openai.client';
import { EVIDENCE_SOURCES } from '../recommendations/content/evidence-sources';

/**
 * OpenAiClient 단위 테스트 (구 GeminiClient 테스트 이식).
 * MOCK_OPENAI=true일 때 mock 응답을 반환하고, false + 키 없음일 때 OpenAiUnavailable을 던지는지 확인.
 * 실제 API 호출은 외부 의존이라 여기서 검증하지 않는다 (e2e에서 별도).
 * T8: EvidencePolicy 사후 검증 동작(정상 통과 + 의료 표현 위반 시 503)도 함께 검증.
 */
describe('OpenAiClient', () => {
  // 정책은 stateless하므로 인스턴스를 공유해도 안전하다.
  const policy = new EvidencePolicy();

  function makeConfig(over: Record<string, string> = {}): ConfigService {
    const map: Record<string, string> = {
      OPENAI_API_KEY: '',
      OPENAI_MODEL: 'gpt-4o-mini',
      MOCK_OPENAI: 'false',
      ...over,
    };
    return {
      get: (key: string, def?: string) => map[key] ?? def,
    } as unknown as ConfigService;
  }

  it('MOCK_OPENAI=true 시 추천 mock 응답 반환 (정책 통과)', async () => {
    const client = new OpenAiClient(makeConfig({ MOCK_OPENAI: 'true' }), policy);
    const items = await client.generateRecommendations(
      { id: 'd1', overallScore: 70 },
      { uvIndex: 5 },
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBeDefined();
    expect(items[0].timing).toBeDefined();
  });

  it('MOCK_OPENAI=true 시 날씨 기반 제품 mock 응답 — 실제 카탈로그에서 productId 선택 (N27)', async () => {
    const client = new OpenAiClient(makeConfig({ MOCK_OPENAI: 'true' }), policy);
    const catalog = [
      {
        id: 'prod-11',
        name: '1025 독도 클렌저',
        brand: '라운드랩',
        category: 'barrier',
        matchedIngredients: ['약산성 클렌저'],
      },
      {
        id: 'prod-2',
        name: '자작나무 수분 선크림',
        brand: '라운드랩',
        category: 'barrier',
        matchedIngredients: ['징크옥사이드'],
      },
      {
        id: 'prod-13',
        name: '다이브인 히알루론산 세럼',
        brand: '토리든',
        category: 'moisture',
        matchedIngredients: ['히알루론산'],
      },
    ];
    const items = await client.generateWeatherProducts({ uvIndex: 5 }, catalog);
    expect(items).toHaveLength(3);
    const timings = items.map((i) => i.timing).sort();
    expect(timings).toEqual(['세안 후', '외출 전', '외출 후']);
    // 가상 productId가 아니라 카탈로그에 실제 존재하는 id만 선택한다.
    const catalogIds = new Set(catalog.map((p) => p.id));
    for (const item of items) {
      expect(catalogIds.has(item.productId)).toBe(true);
    }
  });

  it('키 없음 시 OpenAiUnavailable (추천)', async () => {
    const client = new OpenAiClient(makeConfig({ MOCK_OPENAI: 'false' }), policy);
    await expect(
      client.generateRecommendations({ id: 'd1' }, {}),
    ).rejects.toThrow(OpenAiUnavailable);
  });

  it('키 없음 시 OpenAiUnavailable (제품)', async () => {
    const client = new OpenAiClient(makeConfig({ MOCK_OPENAI: 'false' }), policy);
    await expect(
      client.generateWeatherProducts({}, []),
    ).rejects.toThrow(OpenAiUnavailable);
  });

  /**
   * R30: 재시도·서킷브레이커. fetch를 스텁해 HTTP 상태별 동작만 검증한다.
   * 재시도 대기를 실제로 기다리지 않도록, 백오프가 필요한 케이스는 1회로 제한한다.
   */
  describe('R30 재시도 · 서킷브레이커', () => {
    const originalFetch = global.fetch;

    // 정책·형태 검증을 모두 통과하는 최소 응답. OpenAI Chat Completions 계약
    // (choices[0].message.content가 { items: [...] } JSON 문자열)을 그대로 흉내낸다.
    const okBody = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                {
                  title: '자기 전 보습 관리로 피부장벽을 케어하세요',
                  explanation:
                    '오늘 측정된 피부 수분 지표를 고려해, 자기 전 보습 케어가 피부장벽 유지에 도움될 수 있습니다.',
                  ingredientTags: ['히알루론산'],
                  timing: '자기 전',
                  sourceIds: [],
                },
              ],
            }),
          },
        },
      ],
    };

    function stubFetch(statuses: number[]): jest.Mock {
      const fn = jest.fn(() => {
        const status = statuses.shift() ?? 200;
        return Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(okBody),
        } as unknown as Response);
      });
      global.fetch = fn as unknown as typeof fetch;
      return fn;
    }

    function makeClient(): OpenAiClient {
      return new OpenAiClient(
        makeConfig({ OPENAI_API_KEY: 'k', MOCK_OPENAI: 'false' }),
        policy,
      );
    }

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('429는 재시도해 성공으로 이어진다', async () => {
      const fetchMock = stubFetch([429, 200]);
      const items = await makeClient().generateRecommendations({ id: 'd1' }, {});
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(items).toHaveLength(1);
    });

    it('4xx(429 제외)는 재시도하지 않고 즉시 실패한다', async () => {
      const fetchMock = stubFetch([400]);
      await expect(
        makeClient().generateRecommendations({ id: 'd1' }, {}),
      ).rejects.toThrow(OpenAiUnavailable);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('5xx는 최대 3회까지만 호출한다', async () => {
      const fetchMock = stubFetch([500, 500, 500]);
      await expect(
        makeClient().generateRecommendations({ id: 'd1' }, {}),
      ).rejects.toThrow(OpenAiUnavailable);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('연속 실패 10회 후에는 호출 없이 즉시 실패한다', async () => {
      // 400은 재시도하지 않으므로 호출 1회 = 실패 1회로 임계까지 빠르게 도달한다.
      const fetchMock = stubFetch(Array<number>(10).fill(400));
      const client = makeClient();
      for (let i = 0; i < 10; i++) {
        await expect(
          client.generateRecommendations({ id: 'd1' }, {}),
        ).rejects.toThrow(OpenAiUnavailable);
      }
      expect(fetchMock).toHaveBeenCalledTimes(10);

      await expect(
        client.generateRecommendations({ id: 'd1' }, {}),
      ).rejects.toThrow('circuit open');
      expect(fetchMock).toHaveBeenCalledTimes(10);
    });
  });

  /**
   * 근거 인용(sourceIds) — evidence-sources.ts 레지스트리에서만 고르게 한다.
   * LLM이 레지스트리에 없는 id를 지어내도 서버가 걸러낸다.
   */
  describe('sourceIds 화이트리스트 필터링', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    function stubFetchOnce(sourceIds: string[]): jest.Mock {
      const fn = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      items: [
                        {
                          title: '오늘은 이중 세안을 권장해요',
                          explanation: '초미세먼지 노출을 고려해 이중 세안을 권장합니다.',
                          ingredientTags: ['약산성 클렌저'],
                          timing: '외출 후',
                          sourceIds,
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        } as unknown as Response),
      );
      global.fetch = fn as unknown as typeof fetch;
      return fn;
    }

    it('레지스트리에 실제 있는 id는 그대로 통과한다', async () => {
      const knownId = EVIDENCE_SOURCES[0].id;
      stubFetchOnce([knownId]);
      const client = new OpenAiClient(
        makeConfig({ OPENAI_API_KEY: 'k', MOCK_OPENAI: 'false' }),
        policy,
      );
      const items = await client.generateRecommendations({ id: 'd1' }, {});
      expect(items[0].sourceIds).toEqual([knownId]);
    });

    it('레지스트리에 없는 id는 조용히 걸러진다(LLM이 지어낸 출처 차단)', async () => {
      stubFetchOnce(['made-up-source-id-that-does-not-exist']);
      const client = new OpenAiClient(
        makeConfig({ OPENAI_API_KEY: 'k', MOCK_OPENAI: 'false' }),
        policy,
      );
      const items = await client.generateRecommendations({ id: 'd1' }, {});
      expect(items[0].sourceIds).toEqual([]);
    });
  });
});
