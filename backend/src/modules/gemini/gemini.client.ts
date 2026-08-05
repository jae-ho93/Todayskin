import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EvidencePolicy } from './evidence.policy';

/**
 * GeminiClient — Google Generative Language API 호출을 캡슐화.
 *
 * 기존 FastAPI gemini_client.py의 generate_recommendations / generate_weather_products 이식.
 *
 * 설계 원칙 (BACKEND_TASKS.md T8 기준):
 * - 의료적 확정 표현 방지: system prompt로 강제 + EvidencePolicy 사후 검증
 * - grade/sourceLabel은 서버가 고정 (LLM이 결정하지 않음)
 * - ingredientTags는 화이트리스트 강제 필터링
 * - GEMINI_API_KEY가 없거나 호출 실패 시 가짜 데이터로 대체하지 않고 GeminiUnavailable 예외
 * - 개발용 mock 응답과 운영 응답을 분리 (MOCK_GEMINI 환경변수)
 */

// 7.2 성분 추천 필터링 원칙: 임상 근거가 확립된 성분으로만 한정
export const ALLOWED_INGREDIENTS = [
  '나이아신아마이드',
  '히알루론산',
  '세라마이드',
  '판테놀',
  '센텔라',
  '시어버터',
  '징크옥사이드',
  '펩타이드',
  '아데노신',
  '약산성 클렌저',
] as const;

// 추천 timing — Recommendation 응답 계약
export const RECOMMENDATION_TIMINGS = ['외출 후', '자기 전', '언제든'] as const;

// 제품 timing — Product 응답 계약 (ProductTiming)
export const PRODUCT_TIMINGS = ['세안 후', '외출 전', '외출 후'] as const;

// Product.category와 1:1 대응
export const PRODUCT_CATEGORIES = ['moisture', 'elasticity', 'brightening', 'barrier'] as const;

/**
 * Gemini 호출 실패(키 없음, timeout, 응답 파싱 실패 등).
 * 호출부에서 목업으로 폴백하지 않고 503을 반환해야 함을 의미.
 */
export class GeminiUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiUnavailable';
  }
}

export interface GeneratedRecommendation {
  title: string;
  explanation: string;
  ingredientTags: string[];
  timing: string | null;
}

export interface GeneratedWeatherProduct {
  timing: string;
  category: string;
  name: string;
  brand: string;
  explanation: string;
  ingredientTags: string[];
}

interface WeatherInput {
  observedAt?: string | null;
  regionName?: string | null;
  uvIndex?: number | null;
  uvStatus?: string | null;
  uvIndexPeak?: number | null;
  uvStatusPeak?: string | null;
  uvIndexPeakHour?: number | null;
  ozonePpm?: number | null;
  ozoneStatus?: string | null;
  pm25?: number | null;
  pm25Status?: string | null;
  pm10?: number | null;
  pm10Status?: string | null;
  caiValue?: number | null;
  caiStatus?: string | null;
  no2Value?: number | null;
  so2Value?: number | null;
  coValue?: number | null;
  [key: string]: unknown;
}

interface SkinInput {
  id?: string;
  capturedAt?: string;
  overallScore?: number;
  parts?: unknown[];
  [key: string]: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isGeneratedRecommendation(value: unknown): value is GeneratedRecommendation {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    isNonEmptyString(item.title) &&
    isNonEmptyString(item.explanation) &&
    isStringArray(item.ingredientTags) &&
    (item.timing === null ||
      (typeof item.timing === 'string' &&
        (RECOMMENDATION_TIMINGS as readonly string[]).includes(item.timing)))
  );
}

function isGeneratedWeatherProduct(value: unknown): value is GeneratedWeatherProduct {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    isNonEmptyString(item.timing) &&
    isNonEmptyString(item.category) &&
    isNonEmptyString(item.name) &&
    isNonEmptyString(item.brand) &&
    isNonEmptyString(item.explanation) &&
    isStringArray(item.ingredientTags)
  );
}

const SYSTEM_PROMPT = `당신은 화장품 추천 서비스의 근거 기반 추천 작성자입니다.
사용자의 오늘 피부 측정값과 오늘의 날씨/대기질 데이터를 함께 보고, 확립된 피부과학 지식
(자외선-광노화, 오존/미세먼지로 인한 산화 스트레스와 콜라겐 분해, 습도 저하와 피부장벽 손상 등)에
근거해 스킨케어 행동을 2~3개 추천하세요. 그 중 반드시 다음 두 가지를 포함하세요:

1. **외출 후 세안법** (timing: "외출 후") — 오늘의 오존·미세먼지·초미세먼지·자외선 수치를 근거로,
   집에 돌아왔을 때 어떻게 세안하면 좋을지. 예: 대기질이 나쁜 날엔 이중세안, 좋은 날엔 순한 세안으로
   충분하다는 식으로 오늘 수치에 맞게 구체적으로 조정하세요.
2. **자기 전 관리법** (timing: "자기 전") — 오늘 측정된 피부 부위별 상태(수분·탄력 등)와 오늘 하루의
   누적 환경 노출을 함께 고려해, 자기 전에 어떤 케어를 하면 좋을지.

그 외 추가로 필요하다고 판단되면 timing을 "언제든"으로 한 추천을 더 넣어도 됩니다.

반드시 지킬 규칙:
1. "진단", "치료", "질환" 등 의료적 확정 표현을 쓰지 마세요. "측정값", "추정", "~에 도움될 수 있음",
   "~하는 경향이 있어요" 같은 완곡한 표현만 사용하세요.
2. 특정 논문·연구·기관명을 인용하거나 지어내지 마세요. 존재를 확인할 수 없는 출처를 만들어내면 안
   됩니다. 근거는 일반적으로 확립된 피부과학 지식이라는 선에서만 설명하세요.
3. ingredientTags는 반드시 다음 목록에서만 골라 사용하세요 (목록 밖 성분 언급 금지): ${ALLOWED_INGREDIENTS.join(', ')}
4. 톤은 병원 대기실이 아니라 매일 쓰는 날씨 앱처럼 친근하고 부담스럽지 않게 작성하세요.
5. 출력은 지정된 JSON 스키마를 그대로 따르세요.`;

const PRODUCT_SYSTEM_PROMPT = `당신은 화장품 추천 서비스의 근거 기반 제품 추천 작성자입니다.
오늘의 날씨/대기질 데이터만 보고(사용자의 피부 측정값은 아직 없음), 확립된 피부과학 지식
(자외선-광노화, 오존/미세먼지로 인한 산화 스트레스, 습도 저하와 피부장벽 손상 등)에 근거해 하루 중
화장품을 실제로 쓰는 다음 세 상황 각각에 맞는 화장품을 정확히 하나씩, 총 3개를 추천하세요:

1. **세안 후** (timing: "세안 후") — 세안 직후 피부결을 정돈·보호하는 데 도움 되는 제품
   (예: 토너, 에센스, 로션 등). 오늘 습도·미세먼지 등으로 인한 피부 상태를 고려하세요.
2. **외출 전** (timing: "외출 전") — 오늘 자외선지수·대기질을 근거로 외출 전 미리 발라두면
   좋은 제품 (예: 선크림, 프라이머 등).
3. **외출 후 밖에 있을 때** (timing: "외출 후") — 아직 귀가하지 않고 밖에 있는 동안 휴대하며
   틈틈이 쓰기 좋은 제품 (예: 수분 미스트, 쿠션, 블로팅 페이퍼, 립밤 등). 오늘 오존·미세먼지·
   자외선 누적 노출을 고려하세요.

세 상황의 제품 종류(카테고리·타입)는 서로 겹치지 않게 다양하게 고르세요 — 매번 같은 종류의
크림/세럼만 추천하지 마세요.

반드시 지킬 규칙:
1. name/brand는 실제 존재하는 특정 상용 브랜드·제품을 언급하지 마세요. 가상의 제품명·브랜드명을
   지어내되, 어떤 제품 종류인지 이름에서 드러나게 하세요.
2. "진단", "치료", "질환" 등 의료적 확정 표현을 쓰지 마세요. "~에 도움될 수 있음", "~하는 경향이
   있어요" 같은 완곡한 표현만 사용하세요.
3. 존재를 확인할 수 없는 논문·연구·기관을 인용하거나 지어내지 마세요.
4. ingredientTags는 반드시 다음 목록에서만 골라 사용하세요 (목록 밖 성분 언급 금지): ${ALLOWED_INGREDIENTS.join(', ')}
5. category는 그 제품의 주요 효능에 가장 가까운 것으로 고르세요: moisture(보습), elasticity(탄력),
   brightening(미백), barrier(장벽 강화).
6. explanation에는 오늘 날씨/대기질의 어떤 수치 때문에 이 상황에 이 제품·성분이 도움될 수 있는지
   구체적인 근거를 담으세요.
7. 톤은 매일 쓰는 날씨 앱처럼 친근하고 부담스럽지 않게 작성하세요.
8. 출력은 지정된 JSON 스키마를 그대로 따르고, timing은 3개 각각 정확히 한 번씩만 사용하세요.`;

@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly mockEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly evidencePolicy: EvidencePolicy,
  ) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.model = this.configService.get<string>('GEMINI_MODEL', 'gemini-flash-latest');
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    // 개발용 mock — 운영에서는 반드시 false여야 함.
    // ConfigService가 envFilePath 파일을 읽지 못한 경우를 대비해 process.env도 직접 확인한다.
    const mockFlag =
      this.configService.get<string>('MOCK_GEMINI') ??
      process.env.MOCK_GEMINI ??
      'false';
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
    this.mockEnabled = mockFlag === 'true' && nodeEnv !== 'production';
    if (mockFlag === 'true' && nodeEnv === 'production') {
      this.logger.error(
        'production 환경에서는 MOCK_GEMINI를 사용할 수 없습니다. 실제 Gemini 호출 또는 503 응답만 허용합니다.',
      );
    }
  }

  /**
   * 운영 환경에서 mock fallback이 비활성화되어 있는지 검증 가능한 지점.
   * 테스트(T13)와 운영 시작 로그에서 mock이 꺼져 있는지 확인한다.
   */
  isMockEnabled(): boolean {
    return this.mockEnabled;
  }

  /**
   * B등급 추천 생성 — 피부 측정값 + 날씨를 Gemini에 전달.
   * 서버가 grade=B, sourceLabel을 고정한다 (LLM이 결정하지 않음).
   */
  async generateRecommendations(
    skin: SkinInput,
    weather: WeatherInput,
  ): Promise<GeneratedRecommendation[]> {
    if (this.mockEnabled) {
      return this.mockRecommendations();
    }
    if (!this.apiKey) {
      throw new GeminiUnavailable('GEMINI_API_KEY not configured');
    }

    const payload = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `[오늘 피부 측정값]\n${JSON.stringify(skin)}\n\n[오늘 날씨/대기질]\n${JSON.stringify(weather)}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RECOMMENDATION_RESPONSE_SCHEMA,
        temperature: 0.4,
      },
    };

    const rawItems = await this.callGemini<unknown>(payload);
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new GeminiUnavailable('Gemini returned no recommendation items');
    }
    const items = rawItems.filter(isGeneratedRecommendation);
    if (items.length !== rawItems.length || items.length === 0) {
      throw new GeminiUnavailable('Gemini returned an invalid recommendation shape');
    }

    // 화이트리스트 강제 필터링
    for (const item of items) {
      item.ingredientTags = (item.ingredientTags ?? []).filter((t) =>
        (ALLOWED_INGREDIENTS as readonly string[]).includes(t),
      );
    }

    // 의료적 확정 표현 사후 검증 — 위반 시 가짜 데이터로 대체하지 않고 503.
    const policyResult = this.evidencePolicy.validateRecommendations(items);
    if (!policyResult.ok) {
      this.logger.warn(
        `Gemini evidence policy violation: ${JSON.stringify(policyResult.violations)}`,
      );
      throw new GeminiUnavailable(
        'Gemini output violated evidence policy',
      );
    }

    return items;
  }

  /**
   * 날씨 기반(A등급) 제품 생성 — 날씨만으로 세 상황별 화장품을 추천.
   * 서버가 grade=A, timing/category 유효성을 강제한다.
   */
  async generateWeatherProducts(
    weather: WeatherInput,
  ): Promise<GeneratedWeatherProduct[]> {
    if (this.mockEnabled) {
      return this.mockWeatherProducts();
    }
    if (!this.apiKey) {
      throw new GeminiUnavailable('GEMINI_API_KEY not configured');
    }

    const payload = {
      system_instruction: { parts: [{ text: PRODUCT_SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: `[오늘 날씨/대기질]\n${JSON.stringify(weather)}` }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: PRODUCT_RESPONSE_SCHEMA,
        temperature: 0.5,
      },
    };

    const rawItems = await this.callGemini<unknown>(payload);
    if (!Array.isArray(rawItems)) {
      throw new GeminiUnavailable('Gemini returned an invalid product list');
    }
    const items = rawItems.filter(isGeneratedWeatherProduct);
    if (items.length !== rawItems.length) {
      throw new GeminiUnavailable('Gemini returned an invalid product shape');
    }

    // timing별 정확히 1개만 남기고, category/성분 화이트리스트 검증
    const seenTimings = new Set<string>();
    const results: GeneratedWeatherProduct[] = [];
    for (const item of items) {
      const timing = item.timing;
      const category = item.category;
      if (
        !(PRODUCT_TIMINGS as readonly string[]).includes(timing) ||
        seenTimings.has(timing) ||
        !(PRODUCT_CATEGORIES as readonly string[]).includes(category)
      ) {
        continue;
      }
      seenTimings.add(timing);
      item.ingredientTags = (item.ingredientTags ?? []).filter((t) =>
        (ALLOWED_INGREDIENTS as readonly string[]).includes(t),
      );
      results.push(item);
    }

    if (results.length !== PRODUCT_TIMINGS.length) {
      throw new GeminiUnavailable(
        'Gemini returned an incomplete product recommendation set',
      );
    }

    // 의료적 확정 표현 사후 검증 — 위반 시 가짜 제품으로 대체하지 않고 503.
    const policyResult = this.evidencePolicy.validateWeatherProducts(results);
    if (!policyResult.ok) {
      this.logger.warn(
        `Gemini evidence policy violation (products): ${JSON.stringify(policyResult.violations)}`,
      );
      throw new GeminiUnavailable(
        'Gemini output violated evidence policy',
      );
    }

    return results;
  }

  // ── 내부 헬퍼 ──────────────────────────────────

  private async callGemini<T>(payload: unknown): Promise<T> {
    if (!this.apiKey) {
      throw new GeminiUnavailable('GEMINI_API_KEY not configured');
    }

    let res: Response;
    try {
      res = await fetch(`${this.endpoint}?key=${encodeURIComponent(this.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      throw new GeminiUnavailable(
        `Gemini request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (!res.ok) {
      throw new GeminiUnavailable(`Gemini request failed: HTTP ${res.status}`);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (e) {
      throw new GeminiUnavailable(
        `Gemini response parse failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const candidates = (data as { candidates?: unknown })?.candidates;
    const text = (candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined)?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new GeminiUnavailable('Unexpected Gemini response shape: no text');
    }

    try {
      return JSON.parse(text) as T;
    } catch (e) {
      throw new GeminiUnavailable(
        `Gemini JSON decode failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // ── 개발용 mock 응답 (MOCK_GEMINI=true일 때만) ──

  private mockRecommendations(): GeneratedRecommendation[] {
    return [
      {
        title: '오늘은 이중 세안을 권장해요',
        explanation:
          '초미세먼지(PM2.5) 노출은 모공에 침투해 활성산소를 만들 수 있다는 관찰이 있습니다. 이중 세안으로 잔여 오염물질 제거에 도움될 수 있습니다.',
        ingredientTags: ['약산성 클렌저', '세라마이드'],
        timing: '외출 후',
      },
      {
        title: '자기 전 보습 관리로 피부장벽을 케어하세요',
        explanation:
          '오늘 측정된 피부 수분 지표와 낮 동안의 건조 환경을 고려해, 자기 전 보습 케어가 피부장벽 유지에 도움될 수 있습니다.',
        ingredientTags: ['히알루론산', '세라마이드'],
        timing: '자기 전',
      },
    ];
  }

  private mockWeatherProducts(): GeneratedWeatherProduct[] {
    return [
      {
        timing: '세안 후',
        category: 'barrier',
        name: '릴렉싱 리커버리 토너',
        brand: 'LabSkin',
        explanation: '오늘 미세먼지 수치가 보통이라 세안 직후 피부결 정돈에 도움되는 보습 토너를 추천해요.',
        ingredientTags: ['히알루론산', '나이아신아마이드'],
      },
      {
        timing: '외출 전',
        category: 'barrier',
        name: '데일리 실드 선크림',
        brand: 'LabSkin',
        explanation: '오늘 자외선지수에 맞춰 외출 전 발라두면 자외선 노출 관리에 도움될 수 있어요.',
        ingredientTags: ['징크옥사이드', '나이아신아마이드'],
      },
      {
        timing: '외출 후',
        category: 'moisture',
        name: '휴대용 수분 미스트',
        brand: 'LabSkin',
        explanation: '오존·미세먼지 누적 노출 환경에서 틈틈이 수분을 보충해 피부 건조감을 낮추는 데 도움될 수 있어요.',
        ingredientTags: ['판테놀', '센텔라'],
      },
    ];
  }
}

// ── Gemini response schemas ──────────────────────

const RECOMMENDATION_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      explanation: { type: 'STRING' },
      ingredientTags: { type: 'ARRAY', items: { type: 'STRING' } },
      timing: { type: 'STRING', enum: [...RECOMMENDATION_TIMINGS] },
    },
    required: ['title', 'explanation', 'ingredientTags', 'timing'],
  },
} as const;

const PRODUCT_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      timing: { type: 'STRING', enum: [...PRODUCT_TIMINGS] },
      category: { type: 'STRING', enum: [...PRODUCT_CATEGORIES] },
      name: { type: 'STRING' },
      brand: { type: 'STRING' },
      explanation: { type: 'STRING' },
      ingredientTags: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['timing', 'category', 'name', 'brand', 'explanation', 'ingredientTags'],
  },
} as const;
