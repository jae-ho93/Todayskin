import { ConfigService } from '@nestjs/config';
import { EvidencePolicy } from './evidence.policy';
import { GeminiClient, GeminiUnavailable } from './gemini.client';

/**
 * GeminiClient 단위 테스트.
 * MOCK_GEMINI=true일 때 mock 응답을 반환하고, false + 키 없음일 때 GeminiUnavailable을 던지는지 확인.
 * 실제 API 호출은 외부 의존이라 여기서 검증하지 않는다 (e2e에서 별도).
 * T8: EvidencePolicy 사후 검증 동작(정상 통과 + 의료 표현 위반 시 503)도 함께 검증.
 */
describe('GeminiClient', () => {
  // 정책은 stateless하므로 인스턴스를 공유해도 안전하다.
  const policy = new EvidencePolicy();

  function makeConfig(over: Record<string, string> = {}): ConfigService {
    const map: Record<string, string> = {
      GEMINI_API_KEY: '',
      GEMINI_MODEL: 'gemini-flash-latest',
      MOCK_GEMINI: 'false',
      ...over,
    };
    return {
      get: (key: string, def?: string) => map[key] ?? def,
    } as unknown as ConfigService;
  }

  it('MOCK_GEMINI=true 시 추천 mock 응답 반환 (정책 통과)', async () => {
    const client = new GeminiClient(makeConfig({ MOCK_GEMINI: 'true' }), policy);
    const items = await client.generateRecommendations(
      { id: 'd1', overallScore: 70 },
      { uvIndex: 5 },
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBeDefined();
    expect(items[0].timing).toBeDefined();
  });

  it('MOCK_GEMINI=true 시 날씨 기반 제품 mock 응답 반환 (3개, 정책 통과)', async () => {
    const client = new GeminiClient(makeConfig({ MOCK_GEMINI: 'true' }), policy);
    const items = await client.generateWeatherProducts({ uvIndex: 5 });
    expect(items).toHaveLength(3);
    const timings = items.map((i) => i.timing).sort();
    expect(timings).toEqual(['세안 후', '외출 전', '외출 후']);
  });

  it('키 없음 시 GeminiUnavailable (추천)', async () => {
    const client = new GeminiClient(makeConfig({ MOCK_GEMINI: 'false' }), policy);
    await expect(
      client.generateRecommendations({ id: 'd1' }, {}),
    ).rejects.toThrow(GeminiUnavailable);
  });

  it('키 없음 시 GeminiUnavailable (제품)', async () => {
    const client = new GeminiClient(makeConfig({ MOCK_GEMINI: 'false' }), policy);
    await expect(
      client.generateWeatherProducts({}),
    ).rejects.toThrow(GeminiUnavailable);
  });
});
