import { CarePlanDto, CareType } from '../dto/care-plan.dto';

/**
 * 빈 화면 금지 — LIVE 생성이 아직 없거나 실패했을 때 즉시 보여줄 정적 fallback.
 *
 * weather는 자외선/대기질 임계값에 기반한 규칙적 판단이 가능하지만, skin/combined는
 * 개인 피부 데이터 없이 규칙만으로 근거 있는 루틴을 만들기 어렵다 — 그래서 셋 다
 * "일반적인 보습 케어" 수준의 안전한 정적 콘텐츠 하나로 통일한다. 실제품 링크가
 * 없으므로 products는 비워둔다(가짜 구매 링크를 보여주지 않는다).
 */
const GENERIC_FALLBACK_ROUTINE = [
  {
    phase: '아침',
    step: '순한 세안 후 보습',
    ingredient: '히알루론산',
    amount: '500원 동전 크기',
    reason: '피부 수분을 유지하는 기본 보습은 대부분의 피부 상태에 도움될 수 있어요.',
    evidence: null,
  },
  {
    phase: '외출 전',
    step: '자외선 차단제 도포',
    ingredient: '징크옥사이드',
    amount: '손가락 한 마디 크기',
    reason: '자외선 차단은 계절·수치와 무관하게 매일 챙기면 도움될 수 있어요.',
    evidence: null,
  },
  {
    phase: '자기 전',
    step: '진정 + 보습 마무리',
    ingredient: '세라마이드',
    amount: '앰플 2~3방울',
    reason: '하루 동안의 외부 자극 이후 피부 장벽을 진정시키는 데 도움될 수 있어요.',
    evidence: null,
  },
];

export function fallbackCarePlan(careType: CareType): CarePlanDto {
  return {
    careType,
    routine: GENERIC_FALLBACK_ROUTINE,
    products: [],
    medicalDisclaimer:
      careType === 'weather'
        ? null
        : '이 결과는 참고용이며 의료적 진단이 아닙니다.',
  };
}
