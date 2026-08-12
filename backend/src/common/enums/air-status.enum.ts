
/**
 * 대기질 등급 — 에어코리아 4단계.
 *
 * 미세먼지·초미세먼지·오존·통합대기환경지수가 공유한다. 자외선은 성격이 달라
 * (좋고 나쁨이 아니라 높고 낮음) 별도 `UvLevel`을 쓴다 — N40.
 */
export enum AirStatus {
  GOOD = 'good',
  MODERATE = 'moderate',
  BAD = 'bad',
  VERY_BAD = 'veryBad',
}
