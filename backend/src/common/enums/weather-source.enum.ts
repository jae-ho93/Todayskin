
/**
 * 날씨 데이터 출처 — 프론트가 측정 불가 상태를 표시할 수 있도록 명시.
 * LIVE: 외부 API에서 실시간 수집
 * CACHED: Redis/DB 캐시(T12+)
 * UNAVAILABLE: 키 없음/호출 실패 — 목업값으로 대체하지 않음
 */
export enum WeatherSource {
  LIVE = 'LIVE',
  CACHED = 'CACHED',
  UNAVAILABLE = 'UNAVAILABLE',
}
