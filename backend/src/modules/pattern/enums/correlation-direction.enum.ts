/**
 * 상관계수 부호 기반 방향. 상관관계의 강하지 방향을 표현한다.
 * 인과관계를 의미하지 않는다 (BACKEND_TASKS.md T10).
 */
export enum CorrelationDirection {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  NEUTRAL = 'neutral',
}
