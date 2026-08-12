
/**
 * 자외선지수 등급 — 기상청 5단계 (낮음 · 보통 · 높음 · 매우높음 · 위험).
 *
 * 대기질(`AirStatus`)과 어휘를 나눈 이유 — N40.
 * 자외선은 "좋음/나쁨"이 아니라 "낮음/높음"으로 말한다. 하나의 enum을 공유하던 때는
 * 자외선지수 9가 "나쁨"으로 표기됐는데, 기상청 기준으로 9는 "매우높음"이다.
 * 타입을 갈라 두면 프론트가 지표를 보고 다시 분기할 필요 없이 컴파일러가 라벨 누락을 잡는다.
 */
export enum UvLevel {
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
  VERY_HIGH = 'veryHigh',
  DANGER = 'danger',
}
