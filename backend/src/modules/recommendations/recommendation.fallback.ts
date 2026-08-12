import { Product } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EvidenceGrade } from './enums/evidence-grade.enum';
import { ProductCategory } from '../products/enums/product-category.enum';
import { RecommendationDto, RecommendationTiming } from './dto/recommendation.dto';
import {
  FALLBACK_SLOT_CONTENT,
  FALLBACK_SOURCE_LABEL,
  fallbackExplanation,
  scorePhrase,
  weatherMetricPhrase,
  WEATHER_PHRASE_UNAVAILABLE,
} from './content/fallback-content';

/**
 * R7: 규칙 기반 추천(FALLBACK)과 제품 선택 규칙.
 *
 * N27/N32의 핵심 약속은 "가상 제품·가상 인용을 만들지 않는다"는 것이다. 그 약속을
 * 지키는 선택 규칙이 서비스 본문에 흩어져 있으면 Gemini 호출·트랜잭션 코드를 읽는
 * 사람과 같은 파일을 공유하게 된다. 여기 함수들은 전부 순수 함수라 카탈로그 배열만
 * 넘기면 Prisma·Redis 목킹 없이 검증할 수 있다.
 */

/** timing 슬롯별 카테고리 우선순위 — 문구가 아니라 선택 규칙이라 content가 아닌 여기 둔다. */
const SLOT_CATEGORY_PREFS: Record<RecommendationTiming, ProductCategory[]> = {
  '외출 후': [ProductCategory.BARRIER, ProductCategory.MOISTURE],
  '자기 전': [ProductCategory.MOISTURE, ProductCategory.BARRIER],
  언제든: [ProductCategory.MOISTURE, ProductCategory.BRIGHTENING],
};

const FALLBACK_SLOT_ORDER: RecommendationTiming[] = ['외출 후', '자기 전', '언제든'];

/** 성분 매칭 0건일 때 붙일 제품 수. */
export const MATCHLESS_FALLBACK_PRODUCT_COUNT = 2;

/**
 * N27/N32 공용: 규칙 기반 실제품 선택 — 등급 A 우선 + 카테고리 우선순위로
 * 결정적으로 골라 최대 count개를 반환한다.
 */
export function pickRuleProducts(
  catalog: Product[],
  categoryPref: string[],
  used: Set<string>,
  count: number,
): Product[] {
  const available = catalog.filter((p) => !used.has(p.id));
  const ranked = [...available].sort((a, b) => {
    const gradeDiff =
      (a.matchedGrade === EvidenceGrade.A ? 0 : 1) -
      (b.matchedGrade === EvidenceGrade.A ? 0 : 1);
    if (gradeDiff !== 0) return gradeDiff;
    const catA = categoryPref.indexOf(a.category);
    const catB = categoryPref.indexOf(b.category);
    return (catA === -1 ? 99 : catA) - (catB === -1 ? 99 : catB);
  });
  return ranked.slice(0, count);
}

/**
 * N27: 성분 매칭이 0건인 추천에 붙일 실제품.
 * '외출 후'는 세안·진정이 먼저이고, 나머지는 보습을 먼저 본다.
 */
export function pickMatchlessProducts(
  catalog: Product[],
  timing: string | null,
  used: Set<string>,
  count: number,
): Product[] {
  const categoryPref =
    timing === '외출 후'
      ? ['barrier', 'moisture']
      : ['moisture', 'barrier', 'brightening', 'elasticity'];
  return pickRuleProducts(catalog, categoryPref, used, count);
}

/** 규칙 fallback 문구용 날씨 요약 — 존재하는 수치만 언급한다(없는 값 추정 금지). */
export function ruleWeatherPhrase(weather: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof weather.uvIndex === 'number') {
    parts.push(weatherMetricPhrase('자외선지수', weather.uvIndex));
  }
  if (typeof weather.pm25 === 'number') {
    parts.push(weatherMetricPhrase('미세먼지', weather.pm25));
  }
  if (typeof weather.pm10 === 'number') {
    parts.push(weatherMetricPhrase('초미세먼지', weather.pm10));
  }
  return parts.length > 0 ? parts.join(', ') : WEATHER_PHRASE_UNAVAILABLE;
}

/**
 * N32: 규칙 기반 빠른 추천 — 실제 카탈로그 제품만 연결한다.
 * AI 상세 분석(LIVE)이 완료되면 job 결과로 교체되는 정직한 자리표시자다.
 * 등급은 B로 표기하되 sourceLabel로 AI가 아님을 명시한다.
 */
export function buildRuleRecommendations(
  catalog: Product[],
  skinInput: Record<string, unknown>,
  weatherInput: Record<string, unknown>,
): RecommendationDto[] {
  const used = new Set<string>();
  const overallScore =
    typeof skinInput.overallScore === 'number' ? skinInput.overallScore : null;
  const weatherPhrase = ruleWeatherPhrase(weatherInput);

  return FALLBACK_SLOT_ORDER.map((timing) => {
    const picked = pickRuleProducts(catalog, SLOT_CATEGORY_PREFS[timing], used, 2);
    picked.forEach((p) => used.add(p.id));
    return {
      id: `fast-${shortId()}`,
      title: FALLBACK_SLOT_CONTENT[timing].title,
      grade: EvidenceGrade.B,
      sourceLabel: FALLBACK_SOURCE_LABEL,
      explanation: fallbackExplanation({
        body: FALLBACK_SLOT_CONTENT[timing].body,
        scorePhrase: overallScore !== null ? scorePhrase(overallScore) : '',
        weatherPhrase,
      }),
      // N32: FALLBACK은 관측 통계가 아니므로 observationalNote는 비운다.
      observationalNote: null,
      ingredientTags: [...new Set(picked.flatMap((p) => p.matchedIngredients))],
      relatedProductIds: picked.map((p) => p.id),
      timing,
    };
  });
}

export function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 20);
}
