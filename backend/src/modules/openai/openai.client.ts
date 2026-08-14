import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EvidencePolicy } from './evidence.policy';
import { EVIDENCE_SOURCES } from '../recommendations/content/evidence-sources';
import {
  CARE_EVIDENCE_SOURCE_TYPES,
  CareEvidenceSourceType,
  CareType,
} from '../care/dto/care-plan.dto';

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

/**
 * 케어 루틴+제품 — Responses API + web_search 도구로 생성한다(Chat Completions +
 * strict json_schema 경로와 별개). 근거는 web_search로 실제 확인된 것만 허용한다.
 */
export interface GeneratedCareEvidence {
  sourceName: string | null;
  sourceUrl: string | null;
  sourceType: CareEvidenceSourceType;
}

export interface GeneratedCareRoutineStep {
  phase: string;
  step: string;
  ingredient: string | null;
  amount: string | null;
  reason: string;
  evidence: GeneratedCareEvidence | null;
}

export interface GeneratedCareProduct {
  name: string;
  url: string;
  reason: string;
  evidence: GeneratedCareEvidence | null;
}

export interface GeneratedCarePlan {
  routine: GeneratedCareRoutineStep[];
  products: GeneratedCareProduct[];
  medicalDisclaimer: string | null;
}

export interface WeatherInput {
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

// ── 케어 루틴+제품 (Responses API + web_search) ──
// strict json_schema를 쓸 수 없는 도구(web_search)를 사용하므로 프롬프트로 JSON 형식을 강제한다.

const CARE_JSON_FORMAT_SPEC = `반드시 아래 형식의 JSON **객체 하나만** 출력하세요. 코드블록(\`\`\`)이나 다른 설명 문장을
앞뒤에 절대 붙이지 마세요 — 응답 전체가 그대로 JSON.parse 가능해야 합니다.

{
  "routine": [
    {
      "phase": "단계 이름 (예: 외출 전, 외출 중, 자기 전 등 상황에 맞게)",
      "step": "무엇을 하는 단계인지",
      "ingredient": "핵심 성분 (없으면 null)",
      "amount": "바르는 양, 예: 500원 동전 크기 (없으면 null)",
      "reason": "오늘 수치/피부상태를 근거로 한 이유",
      "evidence": { "sourceName": "출처명", "sourceUrl": "실제 URL", "sourceType": "WHO|FDA|식약처|AAD|PubMed" } 또는 null
    }
  ],
  "products": [
    {
      "name": "실제 제품명",
      "url": "web_search로 확인한 실제 구매 페이지 URL",
      "reason": "이 제품을 고른 이유",
      "evidence": { "sourceName": "...", "sourceUrl": "...", "sourceType": "WHO|FDA|식약처|AAD|PubMed" } 또는 null
    }
  ],
  "medicalDisclaimer": "의료 면책 문구 (없으면 null)"
}`;

const CARE_EVIDENCE_RULE = `근거(evidence)는 web_search로 실제로 확인한 것만 사용하세요. 다음 기관/데이터베이스의
공식 자료만 근거로 인정합니다: WHO, FDA, 식약처(MFDS), AAD(American Academy of Dermatology), PubMed.
이 목록에 없는 출처(블로그, 쇼핑몰 상세페이지, 개인 웹사이트, 뉴스 기사 등)는 evidence로 쓰지 마세요.
web_search로 위 기관의 자료를 확인하지 못했다면 evidence는 null로 두세요 — sourceUrl을 지어내지 마세요.`;

const CARE_TONE_RULE = `"진단", "치료", "질환", "처방" 등 의료적 확정 표현을 쓰지 마세요. "~에 도움될 수 있음",
"~하는 경향이 있어요" 같은 완곡한 표현만 사용하세요. 톤은 병원이 아니라 매일 쓰는 날씨 앱처럼 친근하게.`;

const CARE_PRODUCT_RULE = `products의 name과 url은 반드시 web_search로 실제로 존재를 확인한 제품만 쓰세요.
가상의 제품명이나 지어낸 URL은 절대 포함하지 마세요. url은 그 제품을 실제로 구매할 수 있는 페이지여야 합니다.
각 product는 routine의 특정 단계·성분과 연결되어야 합니다 — routine과 무관하게 따로 노는 제품을 넣지
마세요. reason 첫 문장에 그 연결을 명시하세요 (예: "위 세럼 단계의 히알루론산을 이 제품으로 대신 쓸 수
있어요" / "자외선 차단 단계에 맞는 제품이에요"). products의 각 항목이 routine의 서로 다른 단계를
하나씩 대응하도록 고르세요 — 같은 단계에 제품 여러 개를 몰아주지 마세요.`;

const CARE_SAFETY_RULE = `사용자의 피부 상태 분류 결과(민감한 피부 양상)가 있다면, routine과 products
모두에서 자극이 될 수 있는 성분·제품 유형(물리적 스크럽, 고농도 AHA/BHA 필링, 향료, 알코올, 강한
세정력의 클렌저 등)을 추천하지 마세요. 대신 진정·보습 중심의 순한 선택지를 우선하세요. 분류 결과가
없거나 "정상"이면 이 제한은 적용하지 않아도 됩니다.
이 규칙을 설명할 때도 다른 문구와 똑같이 완곡한 표현만 쓰세요 — "염증", "치료", "질환" 같은 단어를
피하고 "자극이 될 수 있어요", "순한 제품이 더 편할 수 있어요"처럼 CARE_TONE_RULE과 같은 톤으로
쓰세요. 절대 의료적 확정 표현으로 이유를 설명하지 마세요.`;

function careExcludeRule(excludeProducts: string[]): string {
  if (excludeProducts.length === 0) return '';
  return `\n\n다음 제품은 최근에 이미 추천했으니 이번에는 다른 제품을 고르세요: ${excludeProducts.join(', ')}`;
}

const CARE_WEATHER_SYSTEM_PROMPT = `당신은 화장품 추천 서비스의 날씨 기반 케어 가이드 작성자입니다.
오늘의 날씨/대기질 데이터를 보고, 확립된 피부과학 지식(자외선-광노화, 오존/미세먼지로 인한 산화
스트레스, 습도 저하와 피부장벽 손상 등)에 근거해 "외출 전 / 외출 중 / 귀가 후" 하루 흐름에 맞는
케어 루틴(routine)과 실제 구매 가능한 제품(products)을 함께 제시하세요.

routine에는 각 단계에서 어떤 성분(ingredient)을 얼마나(amount) 바르는지 구체적으로 담으세요.
products는 web_search로 실제 존재를 확인한 제품 2~4개를 담고, 각 제품이 오늘 날씨의 어떤 수치
때문에 도움이 될 수 있는지 reason에 쓰세요.

반드시 지킬 규칙:
1. ${CARE_TONE_RULE}
2. ${CARE_EVIDENCE_RULE}
3. ${CARE_PRODUCT_RULE}
4. ${CARE_JSON_FORMAT_SPEC}`;

const CARE_SKIN_SYSTEM_PROMPT = `당신은 화장품 추천 서비스의 피부 상태 기반 케어 가이드 작성자입니다.
사용자의 오늘 피부 측정값(부위별 상태·수분·탄력), 여드름 구역 리포트(있으면), 피부 상태 분류
결과(있으면)를 보고, 확립된 피부과학 지식에 근거해 케어 루틴(routine)과 실제 구매 가능한
제품(products)을 함께 제시하세요.

routine에는 각 단계에서 어떤 성분(ingredient)을 얼마나(amount) 바르는지 구체적으로 담으세요.
products는 web_search로 실제 존재를 확인한 제품 2~4개를 담고, 각 제품이 사용자의 오늘 피부
상태에 왜 도움이 될 수 있는지 reason에 쓰세요.

**피부 상태 분류 결과를 언급할 때는 반드시 완곡하게 표현하세요** — "건선"처럼 분류 결과를 그대로
단정적으로 말하지 말고 "건선과 유사한 양상이 의심돼요", "~일 수 있어요"처럼 부드럽게 표현하고,
분류 신뢰도가 낮거나 애매하면 이 결과를 아예 언급하지 않아도 됩니다. 이 서비스는 의료 진단을
제공하지 않으므로 medicalDisclaimer에 "이 결과는 참고용이며 의료적 진단이 아닙니다" 같은 문구를
반드시 포함하세요.

반드시 지킬 규칙:
1. ${CARE_TONE_RULE}
2. ${CARE_EVIDENCE_RULE}
3. ${CARE_PRODUCT_RULE}
4. ${CARE_SAFETY_RULE}
5. ${CARE_JSON_FORMAT_SPEC}`;

const CARE_COMBINED_SYSTEM_PROMPT = `당신은 화장품 추천 서비스의 날씨+피부 상태 복합 케어 가이드
작성자입니다. 사용자는 방금 외출했다 귀가해 세안하고 피부를 측정했습니다. 오늘 피부 측정값과
오늘(외출했던 날) 날씨/대기질 데이터를 함께 보고, 두 정보를 모두 반영한 오늘 저녁~밤 케어
루틴(routine)과 실제 구매 가능한 제품(products)을 제시하세요. 예: 오늘 자외선이 높고 피부 수분이
낮다면 그 조합에 맞는 케어를 제안하세요.

routine에는 각 단계에서 어떤 성분(ingredient)을 얼마나(amount) 바르는지 구체적으로 담으세요.
products는 web_search로 실제 존재를 확인한 제품 2~4개를 담고, 오늘 날씨와 피부 상태를 함께
근거로 reason에 쓰세요.

**피부 상태 분류 결과를 언급할 때는 반드시 완곡하게 표현하세요** ("~일 수 있어요" 등). 이 서비스는
의료 진단을 제공하지 않으므로 medicalDisclaimer에 참고용 문구를 반드시 포함하세요.

반드시 지킬 규칙:
1. ${CARE_TONE_RULE}
2. ${CARE_EVIDENCE_RULE}
3. ${CARE_PRODUCT_RULE}
4. ${CARE_SAFETY_RULE}
5. ${CARE_JSON_FORMAT_SPEC}`;

const CARE_MORNING_SYSTEM_PROMPT = `당신은 화장품 추천 서비스의 아침 외출 준비 케어 가이드
작성자입니다. 사용자는 어젯밤 세안 후 피부를 측정했고, 지금은 그 다음날 아침입니다 — 아직 새로
측정하지 않았으므로 어젯밤 피부 측정값을 그대로 쓰되, 날씨는 오늘 아침 실시간 값입니다. 이
조합으로 오늘 "외출 전 준비"와 "외출 중 관리" 중심의 케어 루틴(routine)과 실제 구매 가능한
제품(products)을 제시하세요 — 어젯밤 케어(자기 전 등)는 다루지 마세요.

routine의 phase는 "외출 전"/"외출 중"처럼 오늘 하루 흐름에 맞게 쓰고, 각 단계에서 어떤
성분(ingredient)을 얼마나(amount) 바르는지 구체적으로 담으세요. products는 web_search로 실제
존재를 확인한 제품 2~4개를 담고, 오늘 날씨와 어젯밤 피부 상태를 함께 근거로 reason에 쓰세요.

**피부 상태 분류 결과를 언급할 때는 반드시 완곡하게 표현하세요** ("~일 수 있어요" 등). 이 서비스는
의료 진단을 제공하지 않으므로 medicalDisclaimer에 참고용 문구를 반드시 포함하세요.

반드시 지킬 규칙:
1. ${CARE_TONE_RULE}
2. ${CARE_EVIDENCE_RULE}
3. ${CARE_PRODUCT_RULE}
4. ${CARE_SAFETY_RULE}
5. ${CARE_JSON_FORMAT_SPEC}`;

const CARE_SYSTEM_PROMPTS: Record<CareType, string> = {
  weather: CARE_WEATHER_SYSTEM_PROMPT,
  skin: CARE_SKIN_SYSTEM_PROMPT,
  combined: CARE_COMBINED_SYSTEM_PROMPT,
  morning: CARE_MORNING_SYSTEM_PROMPT,
};

function buildCareUserContent(
  careType: CareType,
  skin: SkinInput | null,
  weather: WeatherInput | null,
  excludeProducts: string[],
): string {
  const parts: string[] = [];
  if (weather) parts.push(`[오늘 날씨/대기질]\n${JSON.stringify(weather)}`);
  if (skin) parts.push(`[오늘 피부 측정값]\n${JSON.stringify(skin)}`);
  return parts.join('\n\n') + careExcludeRule(excludeProducts);
}

function isCareEvidenceSourceType(value: unknown): value is CareEvidenceSourceType {
  return (
    typeof value === 'string' &&
    (CARE_EVIDENCE_SOURCE_TYPES as readonly string[]).includes(value)
  );
}

function normalizeGeneratedCareEvidence(value: unknown): GeneratedCareEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (!isCareEvidenceSourceType(item.sourceType) || item.sourceType === '없음') return null;
  const sourceUrl = typeof item.sourceUrl === 'string' ? item.sourceUrl : null;
  if (!sourceUrl) return null;
  return {
    sourceName: typeof item.sourceName === 'string' ? item.sourceName : null,
    sourceUrl,
    sourceType: item.sourceType,
  };
}

function isGeneratedCareRoutineStep(value: unknown): value is GeneratedCareRoutineStep {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return isNonEmptyString(item.phase) && isNonEmptyString(item.step) && isNonEmptyString(item.reason);
}

function isGeneratedCareProduct(value: unknown): value is GeneratedCareProduct {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return isNonEmptyString(item.name) && isNonEmptyString(item.url) && isNonEmptyString(item.reason);
}

/**
 * LLM 출력 raw 객체 → 검증·정규화된 GeneratedCarePlan.
 * 개별 항목이 형식을 어기면(phase/step/reason 등 필수 필드 누락) 그 항목만 버린다 —
 * routine 3개 중 1개가 깨졌다고 전체를 실패시키지 않는다. evidence는 화이트리스트 밖
 * sourceType이거나 url이 없으면 조용히 null로 떨어뜨린다(근거 없음으로 표시).
 */
function normalizeGeneratedCarePlan(raw: unknown): GeneratedCarePlan {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawRoutine = Array.isArray(obj.routine) ? obj.routine : [];
  const rawProducts = Array.isArray(obj.products) ? obj.products : [];

  const routine: GeneratedCareRoutineStep[] = rawRoutine
    .filter(isGeneratedCareRoutineStep)
    .map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      return {
        phase: item.phase,
        step: item.step,
        ingredient: typeof raw.ingredient === 'string' ? raw.ingredient : null,
        amount: typeof raw.amount === 'string' ? raw.amount : null,
        reason: item.reason,
        evidence: normalizeGeneratedCareEvidence(raw.evidence),
      };
    });

  const products: GeneratedCareProduct[] = rawProducts
    .filter(isGeneratedCareProduct)
    .map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      return {
        name: item.name,
        url: item.url,
        reason: item.reason,
        evidence: normalizeGeneratedCareEvidence(raw.evidence),
      };
    });

  const medicalDisclaimer =
    typeof obj.medicalDisclaimer === 'string' ? obj.medicalDisclaimer : null;

  return { routine, products, medicalDisclaimer };
}

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

/** 케어 루틴 생성(web_search 포함)은 단일 호출이 더 오래 걸려 예산을 별도로 둔다. */
const CARE_DEFAULT_TIMEOUT_MS = 45_000;
const CARE_TOTAL_BUDGET_MS = 100_000;

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
  private readonly responsesEndpoint = 'https://api.openai.com/v1/responses';
  private readonly mockEnabled: boolean;
  private readonly timeoutMs: number;
  private readonly careTimeoutMs: number;

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
    const careTimeout = Number(
      this.configService.get<string | number>('OPENAI_CARE_TIMEOUT_MS') ??
        CARE_DEFAULT_TIMEOUT_MS,
    );
    this.careTimeoutMs =
      Number.isFinite(careTimeout) && careTimeout > 0
        ? careTimeout
        : CARE_DEFAULT_TIMEOUT_MS;
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

  /**
   * 케어 루틴+제품 생성 — Responses API + web_search 도구.
   * strict json_schema를 못 쓰므로 프롬프트로 JSON 형식을 강제하고, 파싱 실패 시
   * 같은 대화(previous_response_id)에 "JSON만 출력하라" 보정 메시지로 1회만 재요청한다
   * (도구 재호출 비용을 아끼려고 보정 요청엔 web_search를 다시 붙이지 않는다).
   *
   * 화이트리스트 밖 sourceType이나 실제 URL 없는 evidence는 normalizeGeneratedCarePlan이
   * 이미 null로 걸러낸다. 나머지 후처리(exclude 필터·링크 HEAD 검증)는 CareService가 한다.
   */
  async generateCarePlan(
    careType: CareType,
    skin: SkinInput | null,
    weather: WeatherInput | null,
    excludeProducts: string[] = [],
  ): Promise<GeneratedCarePlan> {
    if (this.mockEnabled) {
      return this.mockCarePlan(careType);
    }
    if (!this.apiKey) {
      throw new OpenAiUnavailable('OPENAI_API_KEY not configured');
    }

    const payload = {
      model: this.model,
      input: [
        { role: 'system', content: CARE_SYSTEM_PROMPTS[careType] },
        { role: 'user', content: buildCareUserContent(careType, skin, weather, excludeProducts) },
      ],
      tools: [{ type: 'web_search' }],
    };

    const callOpts = {
      endpoint: this.responsesEndpoint,
      timeoutMs: this.careTimeoutMs,
      totalBudgetMs: CARE_TOTAL_BUDGET_MS,
      parse: (res: Response) => res.json() as Promise<unknown>,
    };

    let data = await this.callOpenAi<unknown>(payload, callOpts);
    let raw: unknown;
    try {
      raw = this.extractCarePlanJson(data);
    } catch (e) {
      this.logger.warn(
        `케어 플랜 JSON 파싱 실패, 보정 재요청 1회: ${e instanceof Error ? e.message : String(e)}`,
      );
      const responseId = (data as { id?: string })?.id;
      const correctivePayload = responseId
        ? {
            model: this.model,
            previous_response_id: responseId,
            input: [
              {
                role: 'user',
                content: 'JSON 객체만 출력하세요. 코드블록이나 다른 텍스트 없이 순수 JSON만 응답하세요.',
              },
            ],
          }
        : payload;
      data = await this.callOpenAi<unknown>(correctivePayload, callOpts);
      raw = this.extractCarePlanJson(data);
    }

    const plan = normalizeGeneratedCarePlan(raw);
    if (plan.routine.length === 0 && plan.products.length === 0) {
      throw new OpenAiUnavailable('OpenAI returned an empty care plan');
    }

    // 의료적 확정 표현 사후 검증 — routine/product의 reason만 텍스트 필드라 여기만 본다.
    const policyResult = this.evidencePolicy.validateWeatherProducts([
      ...plan.routine.map((r) => ({ explanation: r.reason })),
      ...plan.products.map((p) => ({ explanation: p.reason })),
    ]);
    if (!policyResult.ok) {
      this.logger.warn(
        `OpenAI evidence policy violation (care plan): ${JSON.stringify(policyResult.violations)}`,
      );
      throw new OpenAiUnavailable('OpenAI output violated evidence policy');
    }

    return plan;
  }

  // ── 내부 헬퍼 ──────────────────────────────────

  /**
   * R30: 429/5xx는 지수 백오프 + 지터로 재시도하고, 연속 실패가 잦으면 회로를 열어
   * 호출 자체를 건너뛴다. 그 밖의 4xx(키 오류·잘못된 요청)는 재시도해도 같은 결과라
   * 즉시 실패한다.
   *
   * opts로 endpoint/timeout/parse를 바꿀 수 있다 — 케어 루틴 생성(Responses API)이
   * Chat Completions와 다른 엔드포인트·응답 형태·타임아웃 예산을 쓰기 때문이다.
   * 재시도·서킷브레이커 정책 자체는 두 경로가 공유한다.
   */
  private async callOpenAi<T>(
    payload: unknown,
    opts?: {
      endpoint?: string;
      timeoutMs?: number;
      totalBudgetMs?: number;
      parse?: (res: Response) => Promise<T>;
    },
  ): Promise<T> {
    if (!this.apiKey) {
      throw new OpenAiUnavailable('OPENAI_API_KEY not configured');
    }
    if (Date.now() < this.circuitOpenUntil) {
      // 회로가 열린 동안은 기다리지 않고 즉시 실패한다 — 호출부는 fallback을 쓴다.
      throw new OpenAiUnavailable('OpenAI circuit open — skipping call');
    }

    const endpoint = opts?.endpoint ?? this.endpoint;
    const timeoutMs = opts?.timeoutMs ?? this.timeoutMs;
    const totalBudgetMs = opts?.totalBudgetMs ?? OPENAI_TOTAL_BUDGET_MS;
    const parse = opts?.parse ?? ((res: Response) => this.parseResponse<T>(res));

    const startedAt = Date.now();
    let lastError = 'unknown';

    for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt++) {
      const outcome = await this.requestOnce(payload, endpoint, timeoutMs);
      if (outcome.kind === 'ok') {
        // 200이라도 본문이 깨졌으면 실패로 센다 — 그 상태가 이어지면 회로를 열어야 한다.
        let parsed: T;
        try {
          parsed = await parse(outcome.res);
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
      const withinBudget = Date.now() - startedAt + backoff + timeoutMs <= totalBudgetMs;
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
    endpoint: string = this.endpoint,
    timeoutMs: number = this.timeoutMs,
  ): Promise<
    { kind: 'ok'; res: Response } | { kind: 'fail'; reason: string; retryable: boolean }
  > {
    let res: Response;
    try {
      // R2: API key를 쿼리스트링이 아니라 헤더로 보낸다. URL은 액세스 로그·프록시
      // 로그·APM 트레이스·예외의 request URL에 그대로 남기 때문이다.
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey as string}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
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

  /**
   * Responses API envelope → 케어 플랜 JSON.
   * `output_text`가 있으면 우선 쓰고, 없으면 `output[]`에서 type:'message' 항목의
   * content[].text를 이어붙인다(web_search 호출이 섞여 output에 여러 아이템이 온다).
   * 텍스트 안에서 첫 `{` ~ 마지막 `}` 구간만 잘라 JSON.parse한다 — 모델이 코드블록이나
   * 설명을 앞뒤에 붙여도 견딘다.
   */
  private extractCarePlanJson(data: unknown): unknown {
    const text = this.extractOutputText(data);
    if (!text) {
      throw new OpenAiUnavailable('Unexpected OpenAI Responses payload: no output text');
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
      throw new OpenAiUnavailable('OpenAI care plan output has no JSON object');
    }
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      throw new OpenAiUnavailable(
        `OpenAI care plan JSON decode failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private extractOutputText(data: unknown): string {
    const envelope = data as {
      output_text?: unknown;
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: unknown }> }>;
    };
    if (typeof envelope?.output_text === 'string' && envelope.output_text.length > 0) {
      return envelope.output_text;
    }
    const messages = envelope?.output?.filter((o) => o.type === 'message') ?? [];
    return messages
      .flatMap((m) => m.content ?? [])
      .filter((c) => typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('\n');
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

  /** 개발용 mock — web_search 호출 없이 careType별 고정 루틴+제품을 돌려준다. */
  private mockCarePlan(careType: CareType): GeneratedCarePlan {
    return {
      routine: [
        {
          phase: careType === 'weather' ? '외출 전' : '아침',
          step: '보습 + 자외선 차단',
          ingredient: '나이아신아마이드',
          amount: '500원 동전 크기',
          reason:
            careType === 'weather'
              ? '오늘 자외선지수를 고려해 외출 전 차단이 도움될 수 있어요.'
              : '오늘 측정된 피부 수분 지표를 고려해 보습이 도움될 수 있어요.',
          evidence: null,
        },
        {
          phase: '자기 전',
          step: '진정 + 보습 마무리',
          ingredient: '센텔라',
          amount: '앰플 2~3방울',
          reason: '하루 동안의 환경 노출 이후 피부 진정에 도움될 수 있어요.',
          evidence: null,
        },
      ],
      products: [
        {
          name: '(mock) 데일리 수분 로션',
          url: 'https://example.com/mock-product',
          reason: 'mock 응답 — 실제 web_search 결과가 아닙니다.',
          evidence: null,
        },
      ],
      medicalDisclaimer:
        careType === 'weather' ? null : '이 결과는 참고용이며 의료적 진단이 아닙니다.',
    };
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
