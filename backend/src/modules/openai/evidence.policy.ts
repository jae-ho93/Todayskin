import { Injectable } from '@nestjs/common';
 
/**
 * EvidencePolicy — LLM(OpenAI)이 생성한 텍스트가 근거 정책을 위반하지 않는지 사후 검증.
 *
 * BACKEND_TASKS.md T8 기준 (Gemini→OpenAI 교체 후에도 정책은 그대로 유지):
 * - 의료적 확정 표현("진단", "치료", "질환" 등)을 LLM이 몰래 섞지 않았는지 확인.
 * - 시스템 프롬프트로 금지하더라도 LLM이 어기는 경우가 있어 서버에서 한 번 더 걸러낸다.
 * - 위반 시 가짜 데이터로 대체하지 않고 OpenAiUnavailable(→ 503)을 던진다.
 * - grade/sourceLabel은 서비스(Service)가 고정하고 이 정책은 텍스트 품질만 검사한다.
 * - 구조화된 근거 인용(sourceIds)은 evidence-sources.ts 레지스트리에서만 고르게
 *   하므로 여기서 검사하지 않는다 — 이 정책은 explanation 자유 텍스트 안에 LLM이
 *   직접 지어낸 인용("연구에 따르면" 등)이 섞이지 않았는지만 본다.
 */
 
// 의료적 확정 표현 — LLM이 출력하면 안 되는 단어/어미.
// "피부과 진단", "치료 효과", "피부 질환" 처럼 의료 행위/질병 확정을 암시하는 표현.
const MEDICAL_ASSERTION_TERMS: readonly string[] = [
  '진단',
  '치료',
  '질환',
  '처방',
  '감염',
  '염증', // 의학적 상태 표현으로 제한
  '피부과', // 특정 의료 기관 맥락
  '의사',
  '환자',
  '임상', // "임상 결과" 등 위조 인용 방지
];
 
// 허위 인용/출처 위조 위반 — 존재를 확인할 수 없는 연구/기관을 만들어내는 표현.
const FABRICATION_TERMS: readonly string[] = [
  '논문',
  '연구결과',
  '연구 결과',
  '가이드라인',
  '학회',
  '연구에 따르면',
  '연구에서는',
  'studies show',
  'research shows',
];
 
/**
 * 검증 결과. 위반 시 어떤 텍스트의 어떤 금지어가 걸렸는지 담는다.
 * 위반 내역은 로그/디버그용이고 응답에 노출하지 않는다.
 */
export interface EvidenceViolation {
  field: 'title' | 'explanation';
  term: string;
}
 
export interface EvidencePolicyResult {
  ok: boolean;
  violations: EvidenceViolation[];
}
 
@Injectable()
export class EvidencePolicy {
  /**
   * 단일 텍스트에서 금지어를 찾는다.
   * returns 발견된 금지어 목록(빈 배열이면 통과).
   */
  private scanText(text: string | null | undefined): string[] {
    if (!text) return [];
    const hits: string[] = [];
    for (const term of MEDICAL_ASSERTION_TERMS) {
      if (text.includes(term)) hits.push(term);
    }
    for (const term of FABRICATION_TERMS) {
      if (text.includes(term)) hits.push(term);
    }
    return hits;
  }
 
  /**
   * 추천 생성 결과 배열을 검증.
   * title, explanation 각각 검사. ingredientTags는 화이트리스트에서 이미 걸러지므로 생략.
   */
  validateRecommendations(
    items: { title?: string | null; explanation?: string | null }[],
  ): EvidencePolicyResult {
    const violations: EvidenceViolation[] = [];
    for (const item of items) {
      const titleHits = this.scanText(item.title);
      if (titleHits.length > 0) {
        violations.push({ field: 'title', term: titleHits[0] });
      }
      const explHits = this.scanText(item.explanation);
      if (explHits.length > 0) {
        violations.push({ field: 'explanation', term: explHits[0] });
      }
    }
    return { ok: violations.length === 0, violations };
  }
 
  /**
   * 날씨 기반 제품 생성 결과 배열을 검증.
   * explanation에만 의료 표현이 들어갈 수 있다(name/brand는 가상 제품명).
   */
  validateWeatherProducts(
    items: { explanation?: string | null }[],
  ): EvidencePolicyResult {
    const violations: EvidenceViolation[] = [];
    for (const item of items) {
      const explHits = this.scanText(item.explanation);
      if (explHits.length > 0) {
        violations.push({ field: 'explanation', term: explHits[0] });
      }
    }
    return { ok: violations.length === 0, violations };
  }
}
