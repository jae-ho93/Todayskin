import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EvidencePolicy } from './evidence.policy';
import { EVIDENCE_SOURCES } from '../recommendations/content/evidence-sources';

/**
 * OpenAiClient — OpenAI Chat Completions API 호출을 캡슐화.
 *
 * GeminiClient(구현체)를 그대로 대체한다 — 공개 메서드 시그니처, grade/sourceLabel
 * 서버 고정, ingredientTags 화이트리스트, EvidencePolicy 사후 검증, 재시도·서킷브레이커
 * 정책은 전부 동일하게 유지한다. 바뀐 건 호출 대상(OpenAI)과 그에 맞는 payload/응답
 * 파싱뿐이다.
 *
 * 설계 원칙 (BACKEND_TASKS.md T8 기준, Gemini 때와 동일):
 * - 의료적 확정 표현 방지: system prompt로 강제 + EvidencePolicy 사후 검증
 * - grade/sourceLabel은 서버가 고정 (LLM이 결정하지 않음)
 * - ingredientTags는 화이트리스트 강제 필터링
 * - 근거 인용(sourceIds)은 evidence-sources.ts 레지스트리에서만 고르게 하고,
 *   레지스트리에 없는 id는 서버가 걸러낸다 — LLM이 새 출처를 지어내지 못한다.
 * - OPENAI_API_KEY가 없거나 호출 실패 시 가짜 데이터로 대체하지 않고 OpenAiUnavailable 예외
 * - 개발용 mock 응답과 운영 응답을 분리 (MOCK_OPENAI 환경변수)
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

/**
 * OpenAI 호출 실패(키 없음, timeout, 응답 파싱 실패 등).
 * 호출부에서 목업으로 폴백하지 않고 503을 반환해야 함을 의미.
 */
export class OpenAiUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAiUnavailable';
  }
}

export interface GeneratedRecommendation {
  title: string;
  explanation: string;
  ingredientTags: string[];
  timing: string | null;
  /** evidence-sources.ts 레지스트리 id. 근거가 안 맞으면 빈 배열. */
  sourceIds: string[];
}

/** Gemini에 전달하는 실제 카탈로그 제품 요약 — id 선택용. */
export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  matchedIngredients: string[];
}

/**
 * N27: 날씨 기반 제품은 LLM이 실제 카탈로그에서 productId를 선택한다.
 * 가상의 name/brand를 만들지 않는다 — productId로 DB 실제품에 매핑하고
 * purchaseUrl까지 응답에 포함한다.
 */
export interface GeneratedWeatherProduct {
  timing: string;
  productId: string;
  explanation: string;
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
    (item.sourceIds === undefined || isStringArray(item.sourceIds)) &&
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
    isNonEmptyString(item.productId) &&
    isNonEmptyString(item.explanation)
  );
}

/** 프롬프트에 넣을 근거 출처 목록 — id와 claim만 준다(원문 확인 없이 url을 베끼지 못하게). */
function evidenceSourcesForPrompt(): string {
  return EVIDENCE_SOURCES.map((s) => `- id: "${s.id}" — ${s.claim}`).join('\n');
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
2. explanation 안에 특정 논문·연구·기관명을 직접 인용하거나 지어내지 마세요("연구에 따르면" 같은
   표현 금지). 근거는 아래 [근거 출처 목록]에서 id로만 선택하세요 — 본문에 풀어쓰지 않습니다.
3. ingredientTags는 반드시 다음 목록에서만 골라 사용하세요 (목록 밖 성분 언급 금지): ${ALLOWED_INGREDIENTS.join(', ')}
4. 톤은 병원 대기실이 아니라 매일 쓰는 날씨 앱처럼 친근하고 부담스럽지 않게 작성하세요.
5. 각 추천의 sourceIds에는 아래 [근거 출처 목록]에서 이 추천을 실제로 뒷받침하는 항목의 id를
   최대 2개까지 넣으세요. 목록에 있는 항목이라도 이 추천 내용과 직접 관련 없으면 넣지 마세요.
   뒷받침하는 항목이 하나도 없으면 sourceIds는 빈 배열로 두세요. **목록에 없는 id를 절대
   지어내지 마세요** — 목록에 없으면 그냥 빈 배열입니다.
6. 출력은 지정된 JSON 스키마를 그대로 따르세요.

[근거 출처 목록]
${evidenceSourcesForPrompt()}`;

const PRODUCT_SYSTEM_PROMPT = `당신은 화장품 추천 서비스의 근거 기반 제품 추천 작성자입니다.
오늘의 날씨/대기질 데이터만 보고(사용자의 피부 측정값은 아직 없음), 확립된 피부과학 지식
(자외선-광노화, 오존/미세먼지로 인한 산화 스트레스, 습도 저하와 피부장벽 손상 등)에 근거해
사용자에게 제공되는 **실제 제품 카탈로그**에서 하루 중 화장품을 실제로 쓰는 세 상황 각각에
맞는 제품을 정확히 하나씩, 총 3개를 선택하세요:

1. **세안 후** (timing: "세안 후") — 세안 직후 피부결을 정돈·보호하는 데 도움 되는 제품
   (토너, 에센스, 로션, 약산성 클렌저 등). 오늘 습도·미세먼지 등으로 인한 피부 상태를 고려하세요.
2. **외출 전** (timing: "외출 전") — 오늘 자외선지수·대기질을 근거로 외출 전 미리 발라두면
   좋은 제품 (선크림 등 자외선 차단 제품 우선).
3. **외출 후 밖에 있을 때** (timing: "외출 후") — 아직 귀가하지 않고 밖에 있는 동안 휴대하며
   틈틈이 쓰기 좋은 제품 (수분 미스트, 보습 세럼 등). 오늘 오존·미세먼지·자외선 누적 노출을 고려하세요.

세 상황의 제품은 서로 겹치지 않게 **서로 다른 productId**를 고르세요.

반드시 지킬 규칙:
1. **가상의 제품명·브랜드명을 절대 만들지 마세요.** 아래 [제품 카탈로그]에 있는 제품의 id만
   productId로 선택하고, 카탈로그에 없는 id를 지어내지 마세요.
2. "진단", "치료", "질환" 등 의료적 확정 표현을 쓰지 마세요. "~에 도움될 수 있음", "~하는 경향이
   있어요" 같은 완곡한 표현만 사용하세요.
3. 존재를 확인할 수 없는 논문·연구·기관을 인용하거나 지어내지 마세요.
4. explanation에는 오늘 날씨/대기질의 어떤 수치 때문에 이 상황에 이 제품이 도움될 수 있는지
   구체적인 근거를 담으세요. (선택한 제품의 matchedIngredients를 근거로 삼아도 좋습니다.)
5. 톤은 매일 쓰는 날씨 앱처럼 친근하고 부담스럽지 않게 작성하세요.
6. 출력은 지정된 JSON 스키마를 그대로 따르고, timing은 3개 각각 정확히 한 번씩만 사용하세요.`;

/**
 * R30: 재시도·서킷브레이커 상수. (Gemini 때와 동일한 정책 — 대상만 OpenAI로 바뀜)
 *
 * 재시도는 **429/5xx에만** 건다. 타임아웃·네트워크 오류를 재시도하면 최악 지연이
 * 타임아웃의 배수가 되는데, `POST /recommendations`는 동기 경로라 그 지연이 그대로
 * 사용자 대기가 된다. 429/5xx는 대개 즉시 돌아오므로 예산을 거의 쓰지 않는다.
 * 그래도 느린 5xx가 겹칠 수 있으니 전체 예산(TOTAL_BUDGET_MS)으로 한 번 더 막는다.
 */
const OPENAI_MAX_ATTEMPTS = 3; // 최초 1회 + 재시도 2회
const OPENAI_BASE_BACKOFF_MS = 400;
const OPENAI_TOTAL_BUDGET_MS = 30_000;
const OPENAI_DEFAULT_TIMEOUT_MS = 15_000;

/** 창(window) 안에 이만큼 연속 실패하면 회로를 연다. */
const CIRCUIT_FAILURE_THRESHOLD = 10;
const CIRCUIT_WINDOW_MS = 60_000;
/** 회로가 열린 동안은 호출 없이 즉시 실패한다 — 워커 슬롯이 묶이지 않게. */
const CIRCUIT_OPEN_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class OpenAiClient {
  private readonly logger = new Logger(OpenAiClient.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly endpoint = 'https://api.openai.com/v1/chat/completions';
  private readonly mockEnabled: boolean;
  private readonly timeoutMs: number;

  /** R30 서킷브레이커 상태 — 카운터와 타임스탬프뿐이라 라이브러리가 필요 없다. */
  private failureCount = 0;
  private failureWindowStart = 0;
  private circuitOpenUntil = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly evidencePolicy: EvidencePolicy,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    const timeout = Number(
      this.configService.get<string | number>('OPENAI_TIMEOUT_MS') ??
        OPENAI_DEFAULT_TIMEOUT_MS,
    );
    this.timeoutMs =
      Number.isFinite(timeout) && timeout > 0 ? timeout : OPENAI_DEFAULT_TIMEOUT_MS;
    // 개발용 mock — 운영에서는 반드시 false여야 함.
    // ConfigService가 envFilePath 파일을 읽지 못한 경우를 대비해 process.env도 직접 확인한다.
    const mockFlag =
      this.configService.get<string>('MOCK_OPENAI') ??
      process.env.MOCK_OPENAI ??
      'false';
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
    this.mockEnabled = mockFlag === 'true' && nodeEnv !== 'production';
    if (mockFlag === 'true' && nodeEnv === 'production') {
      this.logger.error(
        'production 환경에서는 MOCK_OPENAI를 사용할 수 없습니다. 실제 OpenAI 호출 또는 503 응답만 허용합니다.',
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
   * B등급 추천 생성 — 피부 측정값 + 날씨를 OpenAI에 전달.
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
      throw new OpenAiUnavailable('OPENAI_API_KEY not configured');
    }

    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `[오늘 피부 측정값]\n${JSON.stringify(skin)}\n\n[오늘 날씨/대기질]\n${JSON.stringify(weather)}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: RECOMMENDATION_RESPONSE_SCHEMA },
      temperature: 0.4,
    };

    const rawItems = await this.callOpenAi<unknown[]>(payload);
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new OpenAiUnavailable('OpenAI returned no recommendation items');
    }
    const items = rawItems.filter(isGeneratedRecommendation);
    if (items.length !== rawItems.length || items.length === 0) {
      throw new OpenAiUnavailable('OpenAI returned an invalid recommendation shape');
    }

    // 화이트리스트 강제 필터링
    const knownSourceIds = new Set(EVIDENCE_SOURCES.map((s) => s.id));
    for (const item of items) {
      item.ingredientTags = (item.ingredientTags ?? []).filter((t) =>
        (ALLOWED_INGREDIENTS as readonly string[]).includes(t),
      );
      // 레지스트리에 없는 id는 조용히 버린다 — LLM이 만들어낸 id를 화면에 내보내지 않는다.
      item.sourceIds = (item.sourceIds ?? []).filter((id) => knownSourceIds.has(id));
    }

    // 의료적 확정 표현 사후 검증 — 위반 시 가짜 데이터로 대체하지 않고 503.
    const policyResult = this.evidencePolicy.validateRecommendations(items);
    if (!policyResult.ok) {
      this.logger.warn(
        `OpenAI evidence policy violation: ${JSON.stringify(policyResult.violations)}`,
      );
      throw new OpenAiUnavailable(
        'OpenAI output violated evidence policy',
      );
    }

    return items;
  }

  /**
   * 날씨 기반(A등급) 제품 생성 — 날씨만으로 세 상황별 **실제 카탈로그 제품**을 선택.
   * N27: LLM은 카탈로그에서 productId를 고르고, 가상 제품명/브랜드는 만들지 않는다.
   * 실제 제품 매핑·구매 URL 포함은 ProductService가 담당한다.
   */
  async generateWeatherProducts(
    weather: WeatherInput,
    catalog: CatalogProduct[],
  ): Promise<GeneratedWeatherProduct[]> {
    if (this.mockEnabled) {
      return this.mockWeatherProducts(catalog);
    }
    if (!this.apiKey) {
      throw new OpenAiUnavailable('OPENAI_API_KEY not configured');
    }

    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: PRODUCT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `[오늘 날씨/대기질]\n${JSON.stringify(weather)}\n\n[제품 카탈로그]\n${JSON.stringify(catalog)}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: PRODUCT_RESPONSE_SCHEMA },
      temperature: 0.5,
    };

    const rawItems = await this.callOpenAi<unknown[]>(payload);
    if (!Array.isArray(rawItems)) {
      throw new OpenAiUnavailable('OpenAI returned an invalid product list');
    }
    const items = rawItems.filter(isGeneratedWeatherProduct);
    if (items.length !== rawItems.length) {
      throw new OpenAiUnavailable('OpenAI returned an invalid product shape');
    }

    // timing별 정확히 1개만 남긴다. productId의 카탈로그 존재 여부는 서비스가 판정하고,
    // 카탈로그에 없는 id를 골랐다면 ProductService가 규칙 기반 실제품 fallback으로 채운다 (N27).
    const seenTimings = new Set<string>();
    const results: GeneratedWeatherProduct[] = [];
    for (const item of items) {
      const timing = item.timing;
      if (
        !(PRODUCT_TIMINGS as readonly string[]).includes(timing) ||
        seenTimings.has(timing)
      ) {
        continue;
      }
      seenTimings.add(timing);
      results.push(item);
    }

    if (results.length !== PRODUCT_TIMINGS.length) {
      throw new OpenAiUnavailable(
        'OpenAI returned an incomplete product recommendation set',
      );
    }

    // 의료적 확정 표현 사후 검증 — 위반 시 가짜 제품으로 대체하지 않고 503.
    const policyResult = this.evidencePolicy.validateWeatherProducts(results);
    if (!policyResult.ok) {
      this.logger.warn(
        `OpenAI evidence policy violation (products): ${JSON.stringify(policyResult.violations)}`,
      );
      throw new OpenAiUnavailable(
        'OpenAI output violated evidence policy',
      );
    }

    return results;
  }

  // ── 내부 헬퍼 ──────────────────────────────────

  /**
   * R30: 429/5xx는 지수 백오프 + 지터로 재시도하고, 연속 실패가 잦으면 회로를 열어
   * 호출 자체를 건너뛴다. 그 밖의 4xx(키 오류·잘못된 요청)는 재시도해도 같은 결과라
   * 즉시 실패한다.
   */
  private async callOpenAi<T>(payload: unknown): Promise<T> {
    if (!this.apiKey) {
      throw new OpenAiUnavailable('OPENAI_API_KEY not configured');
    }
    if (Date.now() < this.circuitOpenUntil) {
      // 회로가 열린 동안은 기다리지 않고 즉시 실패한다 — 호출부는 fallback을 쓴다.
      throw new OpenAiUnavailable('OpenAI circuit open — skipping call');
    }

    const startedAt = Date.now();
    let lastError = 'unknown';

    for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt++) {
      const outcome = await this.requestOnce(payload);
      if (outcome.kind === 'ok') {
        // 200이라도 본문이 깨졌으면 실패로 센다 — 그 상태가 이어지면 회로를 열어야 한다.
        let parsed: T;
        try {
          parsed = await this.parseResponse<T>(outcome.res);
        } catch (e) {
          this.recordFailure();
          throw e;
        }
        this.recordSuccess();
        return parsed;
      }

      lastError = outcome.reason;
      this.recordFailure();

      const backoff = this.backoffMs(attempt);
      const circuitJustOpened = Date.now() < this.circuitOpenUntil;
      const withinBudget =
        Date.now() - startedAt + backoff + this.timeoutMs <= OPENAI_TOTAL_BUDGET_MS;
      if (
        !outcome.retryable ||
        attempt === OPENAI_MAX_ATTEMPTS ||
        circuitJustOpened ||
        !withinBudget
      ) {
        break;
      }

      this.logger.warn(
        `OpenAI 재시도 ${attempt}/${OPENAI_MAX_ATTEMPTS - 1} (${outcome.reason}) — ${backoff}ms 후`,
      );
      await sleep(backoff);
    }

    throw new OpenAiUnavailable(`OpenAI request failed: ${lastError}`);
  }

  /** 한 번의 호출. 예외를 던지지 않고 재시도 가능 여부를 함께 돌려준다. */
  private async requestOnce(
    payload: unknown,
  ): Promise<
    { kind: 'ok'; res: Response } | { kind: 'fail'; reason: string; retryable: boolean }
  > {
    let res: Response;
    try {
      // R2: API key를 쿼리스트링이 아니라 헤더로 보낸다. URL은 액세스 로그·프록시
      // 로그·APM 트레이스·예외의 request URL에 그대로 남기 때문이다.
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey as string}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      // 타임아웃·네트워크 오류는 재시도하지 않는다(위 상수 주석 참고).
      return {
        kind: 'fail',
        reason: e instanceof Error ? e.message : String(e),
        retryable: false,
      };
    }

    if (!res.ok) {
      return {
        kind: 'fail',
        reason: `HTTP ${res.status}`,
        retryable: res.status === 429 || res.status >= 500,
      };
    }
    return { kind: 'ok', res };
  }

  /** 지수 백오프 + 지터(0~50%) — 동시에 실패한 잡들이 같은 순간에 몰리지 않게. */
  private backoffMs(attempt: number): number {
    const base = OPENAI_BASE_BACKOFF_MS * 2 ** (attempt - 1);
    return Math.round(base * (1 + Math.random() * 0.5));
  }

  private recordSuccess(): void {
    this.failureCount = 0;
  }

  private recordFailure(): void {
    const now = Date.now();
    if (now - this.failureWindowStart > CIRCUIT_WINDOW_MS) {
      this.failureWindowStart = now;
      this.failureCount = 1;
    } else {
      this.failureCount++;
    }
    if (this.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
      this.circuitOpenUntil = now + CIRCUIT_OPEN_MS;
      this.failureCount = 0;
      this.logger.error(
        `OpenAI 연속 실패 ${CIRCUIT_FAILURE_THRESHOLD}회 — ${CIRCUIT_OPEN_MS}ms 동안 호출을 건너뛴다`,
      );
    }
  }

  /**
   * Chat Completions 응답에서 message.content(JSON 문자열)를 꺼내 파싱한다.
   * json_schema로 { items: [...] } 형태를 강제했으므로 items를 꺼내 배열로 돌려준다.
   */
  private async parseResponse<T>(res: Response): Promise<T> {
    let data: unknown;
    try {
      data = await res.json();
    } catch (e) {
      throw new OpenAiUnavailable(
        `OpenAI response parse failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const choices = (data as { choices?: unknown })?.choices;
    const content = (choices as Array<{ message?: { content?: string } }> | undefined)?.[0]
      ?.message?.content;
    if (!content) {
      throw new OpenAiUnavailable('Unexpected OpenAI response shape: no content');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      throw new OpenAiUnavailable(
        `OpenAI JSON decode failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const items = (parsed as { items?: unknown })?.items;
    if (!Array.isArray(items)) {
      throw new OpenAiUnavailable('OpenAI response missing items array');
    }
    return items as T;
  }

  // ── 개발용 mock 응답 (MOCK_OPENAI=true일 때만) ──

  private mockRecommendations(): GeneratedRecommendation[] {
    return [
      {
        title: '오늘은 이중 세안을 권장해요',
        explanation:
          '초미세먼지(PM2.5) 노출은 모공에 침투해 활성산소를 만들 수 있다는 관찰이 있습니다. 이중 세안으로 잔여 오염물질 제거에 도움될 수 있습니다.',
        ingredientTags: ['약산성 클렌저', '세라마이드'],
        timing: '외출 후',
        sourceIds: [],
      },
      {
        title: '자기 전 보습 관리로 피부장벽을 케어하세요',
        explanation:
          '오늘 측정된 피부 수분 지표와 낮 동안의 건조 환경을 고려해, 자기 전 보습 케어가 피부장벽 유지에 도움될 수 있습니다.',
        ingredientTags: ['히알루론산', '세라마이드'],
        timing: '자기 전',
        sourceIds: [],
      },
    ];
  }

  /**
   * N27 개발용 mock — 가상 제품을 만들지 않고 전달받은 실제 카탈로그에서 상황별로 고른다.
   * 카탈로그가 비어 있으면 빈 배열(서비스가 503 처리).
   */
  private mockWeatherProducts(catalog: CatalogProduct[]): GeneratedWeatherProduct[] {
    const hasIngredient = (p: CatalogProduct, tag: string) =>
      p.matchedIngredients.includes(tag);
    const used = new Set<string>();
    const pick = (
      timing: string,
      predicate: (p: CatalogProduct) => boolean,
    ): GeneratedWeatherProduct | null => {
      const p = catalog.find((c) => predicate(c) && !used.has(c.id));
      if (!p) return null;
      used.add(p.id);
      return {
        timing,
        productId: p.id,
        explanation: `${timing} 시점의 오늘 날씨(자외선지수·대기질)를 고려해 고른 실제 제품이에요. 피부 상태 유지에 도움될 수 있어요.`,
      };
    };

    const results: GeneratedWeatherProduct[] = [
      pick('세안 후', (p) =>
        p.category === 'barrier' ? hasIngredient(p, '약산성 클렌저') : false,
      ) ?? pick('세안 후', (p) => p.category === 'moisture'),
      pick('외출 전', (p) =>
        p.category === 'barrier' ? hasIngredient(p, '징크옥사이드') : false,
      ) ?? pick('외출 전', (p) => p.category === 'barrier'),
      pick('외출 후', (p) => p.category === 'moisture'),
    ].filter((x): x is GeneratedWeatherProduct => x !== null);

    return results;
  }
}

// ── OpenAI structured output schemas (json_schema strict mode) ──
// OpenAI strict 모드는 top-level array를 허용하지 않아 { items: [...] } 로 감싼다.
// 모든 속성은 required에 나열해야 한다(strict 모드 제약) — nullable은 type 배열로 표현.

const RECOMMENDATION_RESPONSE_SCHEMA = {
  name: 'skincare_recommendations',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            explanation: { type: 'string' },
            ingredientTags: { type: 'array', items: { type: 'string' } },
            timing: { type: ['string', 'null'], enum: [...RECOMMENDATION_TIMINGS, null] },
            sourceIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'explanation', 'ingredientTags', 'timing', 'sourceIds'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
} as const;

const PRODUCT_RESPONSE_SCHEMA = {
  name: 'weather_products',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            timing: { type: 'string', enum: [...PRODUCT_TIMINGS] },
            productId: { type: 'string' },
            explanation: { type: 'string' },
          },
          required: ['timing', 'productId', 'explanation'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
} as const;
