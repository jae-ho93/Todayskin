import { RecommendationTiming } from '../dto/recommendation.dto';

/**
 * R24: 사용자에게 그대로 노출되는 한국어 문구.
 *
 * 도메인 서비스에 섞여 있던 문자열을 여기로 뺐다. 오탈자 하나를 고치려고 추천
 * 생성 로직 파일을 열 필요가 없고, 문구 PR과 로직 PR이 같은 파일에서 충돌하지 않는다.
 * i18n 프레임워크는 아직 필요 없다 — 상수 파일 하나로 충분하다.
 *
 * 여기의 문구는 계약의 일부다. `sourceLabel`은 "AI가 만든 것인지"를 사용자에게
 * 알리는 표기라 LLM이 정하지 않고 서버가 고정한다(허위 인용 방지).
 */

/** B등급(사진+날씨 매칭) 추천의 출처 표기. LLM이 만들어내지 않는다. */
export const B_GRADE_SOURCE_LABEL = 'AI 종합 분석 · 피부과학 일반 지식 기반';

/** 규칙 기반 빠른 응답(FALLBACK)의 출처 표기 — AI 결과가 아님을 명시한다. */
export const FALLBACK_SOURCE_LABEL = '규칙 기반 빠른 응답 · AI 분석 전';

/** 규칙 기반 fallback 슬롯의 제목·본문 (timing 슬롯당 하나). */
export const FALLBACK_SLOT_CONTENT: Record<
  RecommendationTiming,
  { title: string; body: string }
> = {
  '외출 후': {
    title: '외출 후 진정·세안 루틴',
    body: '외출 후 세안과 진정 케어가 오늘 환경 노출 관리에 도움될 수 있어요.',
  },
  '자기 전': {
    title: '자기 전 보습·배리어 루틴',
    body: '자기 전 보습과 피부장벽 관리가 피부 상태 유지에 도움될 수 있어요.',
  },
  언제든: {
    title: '언제든 수분 유지 루틴',
    body: '하루 중 수분 보충이 건조함 완화에 도움될 수 있어요.',
  },
};

/** 측정값이 하나도 없을 때 쓰는 날씨 요약 — 없는 수치를 지어내지 않는다. */
export const WEATHER_PHRASE_UNAVAILABLE = '자외선·대기질 측정 불가';

export function weatherMetricPhrase(label: string, value: number): string {
  return `${label} ${value}`;
}

export function scorePhrase(overallScore: number): string {
  return ` 측정 점수 ${Math.round(overallScore)}점을 기준으로`;
}

/**
 * 규칙 기반 추천의 설명문. LIVE 교체 예정임을 함께 알려 "AI 결과가 이거구나"라는
 * 오해를 막는다.
 */
export function fallbackExplanation(params: {
  body: string;
  scorePhrase: string;
  weatherPhrase: string;
}): string {
  return `${params.body}${params.scorePhrase} 오늘 날씨(${params.weatherPhrase})를 고려해 고른 실제 제품이에요. AI 상세 분석이 완료되면 LIVE 결과로 교체돼요.`;
}
