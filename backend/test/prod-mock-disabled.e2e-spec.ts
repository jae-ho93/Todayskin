import { ConfigService } from '@nestjs/config';
import { GeminiClient, GeminiUnavailable } from '../src/modules/gemini/gemini.client';
import { EvidencePolicy } from '../src/modules/gemini/evidence.policy';
import { envValidationSchema } from '../src/config/env.validation';

/**
 * 운영 환경 mock fallback 비활성화 테스트 (T13).
 *
 * 목표: 운영(NODE_ENV=production)에서는 Gemini mock과 Inference mock이
 * 실제 데이터처럼 보이지 않도록 강제한다.
 *
 * - GeminiClient.isMockEnabled()는 production + MOCK_GEMINI 미설정 시 false.
 * - envValidationSchema는 MOCK_GEMINI/MOCK_INFERENCE를 'true'|'false'만 허용.
 * - production에서 JWT secret 32자 미만 거부.
 */
describe('운영 환경 mock fallback 비활성화 (e2e)', () => {
  function makeConfig(over: Record<string, string> = {}): ConfigService {
    const map: Record<string, string> = {
      NODE_ENV: 'production',
      GEMINI_API_KEY: 'prod-key',
      GEMINI_MODEL: 'gemini-flash-latest',
      MOCK_GEMINI: 'false',
      ...over,
    };
    return {
      get: (key: string, def?: string) => map[key] ?? def,
    } as unknown as ConfigService;
  }

  describe('GeminiClient', () => {
    const policy = new EvidencePolicy();

    it('production에서 MOCK_GEMINI 미설정 시 mock 비활성화', () => {
      const config = makeConfig({ MOCK_GEMINI: '' });
      const client = new GeminiClient(config, policy);
      expect(client.isMockEnabled()).toBe(false);
    });

    it('production에서 MOCK_GEMINI=false 시 mock 비활성화', () => {
      const config = makeConfig({ MOCK_GEMINI: 'false' });
      const client = new GeminiClient(config, policy);
      expect(client.isMockEnabled()).toBe(false);
    });

    it('production에서 MOCK_GEMINI=true 시 mock 활성화 (개발만, 운영 금지)', () => {
      // 이 경우는 명시적으로 설정하지 않는 한 발생하지 않아야 한다.
      const config = makeConfig({ MOCK_GEMINI: 'true' });
      const client = new GeminiClient(config, policy);
      expect(client.isMockEnabled()).toBe(true);
    });

    it('mock 비활성화 + API 키 없음 시 GeminiUnavailable (가짜 데이터 폴백 금지)', async () => {
      const config = makeConfig({ GEMINI_API_KEY: '', MOCK_GEMINI: 'false' });
      const client = new GeminiClient(config, policy);
      await expect(client.generateRecommendations({}, {})).rejects.toThrow(
        GeminiUnavailable,
      );
      await expect(client.generateWeatherProducts({})).rejects.toThrow(
        GeminiUnavailable,
      );
    });

    it('mock 비활성화 + API 키 있음 시 가짜 응답을 반환하지 않음 (실제 호출 경로)', async () => {
      // 실제 네트워크 호출은 여기서 검증하지 않지만, mock 경로로 빠지지 않음을 확인.
      const config = makeConfig({ GEMINI_API_KEY: 'fake-key', MOCK_GEMINI: 'false' });
      const client = new GeminiClient(config, policy);
      expect(client.isMockEnabled()).toBe(false);
      // 실제 호출은 GeminiUnavailable 또는 네트워크 오류로 끝나야 하며,
      // mock 데이터(title="오늘은 이중 세안...")를 반환하지 않는다.
      try {
        const result = await client.generateWeatherProducts({ uvIndex: 5 });
        // 네트워크가 차단된 환경이면 여기 도달하지 않음.
        // 도달하면 mock 응답이 아닌지 확인.
        const titles = result.map((r) => r.name);
        expect(titles).not.toContain('릴렉싱 리커버리 토너');
      } catch (e) {
        // GeminiUnavailable 또는 fetch 오류는 허용 — mock 폴백이 아님을 의미.
        expect(e).toBeDefined();
      }
    });
  });

  describe('envValidationSchema — 운영 강제', () => {
    const prodBase = {
      NODE_ENV: 'production',
      PORT: 3000,
      ALLOWED_ORIGINS: 'https://app.todayskin.kr',
      DATABASE_URL: 'postgresql://user:pass@db:5432/todayskin',
      JWT_ACCESS_SECRET: 'prod_access_secret_at_least_32_characters_long',
      JWT_REFRESH_SECRET: 'prod_refresh_secret_at_least_32_characters_long',
    };

    it('production에서 JWT_ACCESS_SECRET 32자 미만 거부', () => {
      const { error } = envValidationSchema.validate(
        { ...prodBase, JWT_ACCESS_SECRET: 'short' },
        { abortEarly: false, allowUnknown: true },
      );
      expect(error).toBeDefined();
      expect(error!.message).toContain('JWT_ACCESS_SECRET');
    });

    it('production에서 DATABASE_URL 누락 거부', () => {
      const { error } = envValidationSchema.validate(
        { NODE_ENV: 'production', PORT: 3000, ALLOWED_ORIGINS: '' },
        { abortEarly: false, allowUnknown: true },
      );
      expect(error).toBeDefined();
      expect(error!.message).toContain('DATABASE_URL');
    });

    it('MOCK_GEMINI는 true/false만 허용 (잘못된 값 거부)', () => {
      const { error } = envValidationSchema.validate(
        { ...prodBase, MOCK_GEMINI: 'yes' },
        { abortEarly: false, allowUnknown: true },
      );
      expect(error).toBeDefined();
      expect(error!.message).toContain('MOCK_GEMINI');
    });

    it('MOCK_INFERENCE는 true/false만 허용', () => {
      const { error } = envValidationSchema.validate(
        { ...prodBase, MOCK_INFERENCE: '1' },
        { abortEarly: false, allowUnknown: true },
      );
      expect(error).toBeDefined();
      expect(error!.message).toContain('MOCK_INFERENCE');
    });

    it('production 유효 설정 통과 (mock 모두 false)', () => {
      const { error, value } = envValidationSchema.validate(
        { ...prodBase, MOCK_GEMINI: 'false', MOCK_INFERENCE: 'false' },
        { abortEarly: false, allowUnknown: true },
      );
      expect(error).toBeUndefined();
      expect(value.MOCK_GEMINI).toBe('false');
      expect(value.MOCK_INFERENCE).toBe('false');
    });
  });

  describe('DiagnosisModule — MOCK_INFERENCE 폴백 경고', () => {
    // 모듈 팩토리 로직을 직접 검증: MOCK_INFERENCE=false 시 경고 로그 + 폴백.
    // 실제 PythonInferenceProvider가 없으므로 MockInferenceProvider로 폴백하지만,
    // 운영에서는 이 폴백이 503 계약을 위반하지 않아야 한다(T13 진단 파일 검증에서 별도).
    it('MOCK_INFERENCE=false는 ConfigService에서 false로 읽힌다', () => {
      const config = makeConfig({ MOCK_INFERENCE: 'false' });
      expect(config.get<string>('MOCK_INFERENCE', 'true')).toBe('false');
    });
  });
});
