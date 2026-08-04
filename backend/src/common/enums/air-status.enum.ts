
/**
 * 대기/자외선 등급 — 기존 FastAPI AirStatus Literal과 동일.
 * 프론트는 good/moderate/bad를 색상/문구로 매핑한다.
 */
export enum AirStatus {
  GOOD = 'good',
  MODERATE = 'moderate',
  BAD = 'bad',
}
