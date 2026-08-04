/**
 * |r| 구간 기반 강도. 절대값이 클수록 강한 선형 관계.
 * 0.1 미만은 NEGLIGIBLE로 무시한다 (통계적 의미 부족).
 *
 * 문구와 함께 고정해 프론트가 "강함/보통/약함"을 그대로 노출한다.
 */
export enum CorrelationStrength {
  STRONG = 'strong', // |r| >= 0.7
  MODERATE = 'moderate', // 0.4 <= |r| < 0.7
  WEAK = 'weak', // 0.1 <= |r| < 0.4
  NEGLIGIBLE = 'negligible', // |r| < 0.1
}
