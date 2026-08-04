/**
 * 개인 패턴 분석 상태.
 *
 * - LOCKED: 개인 시계열 데이터가 부족해 분석을 제공하지 않는다.
 *   프론트는 "준비 중" 상태를 그대로 표시한다(404가 아니다).
 * - READY: 최소 샘플 수 이상의 진단+날씨 데이터가 모여 분석 결과를 제공할 수 있다.
 *
 * BACKEND_TASKS.md T10: 데이터 부족은 404가 아니라 200 + LOCKED로 반환한다.
 */
export enum PatternStatus {
  LOCKED = 'LOCKED',
  READY = 'READY',
}
