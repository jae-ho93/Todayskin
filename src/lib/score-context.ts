import type { ScoreSeriesPoint } from '../types';

/**
 * F81: 결과 화면의 점수 맥락 — 직전 측정 대비 변화와 "첫 측정" 여부.
 *
 * 첫 측정(시리즈에서 이 진단이 가장 오래된 기록)이면 비교 대상이 없으므로
 * 변화 배지 대신 기준점 안내를 보여준다. 시리즈 조회가 실패했거나 이 진단이
 * 시리즈에 없으면 둘 다 내지 않는다 — 모르는 것을 아는 척하지 않는다.
 */
export interface ScoreChange {
  label: string;
  up: boolean | null;
}

export interface ScoreContext {
  change: ScoreChange | null;
  isFirstMeasurement: boolean;
}

export function resolveScoreContext(
  points: ScoreSeriesPoint[] | undefined,
  diagnosisId: string,
  overallScore: number,
): ScoreContext {
  if (!points || points.length === 0) return { change: null, isFirstMeasurement: false };

  const idx = points.findIndex((p) => p.diagnosisId === diagnosisId);
  if (idx === -1) return { change: null, isFirstMeasurement: false };
  if (idx === 0) return { change: null, isFirstMeasurement: true };

  const prev = points[idx - 1];
  if (!prev) return { change: null, isFirstMeasurement: false };

  const diff = Math.round(overallScore - prev.overallScore);
  if (diff === 0) {
    return { change: { label: '지난 측정과 동일', up: null }, isFirstMeasurement: false };
  }
  return {
    change: { label: `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}점`, up: diff > 0 },
    isFirstMeasurement: false,
  };
}
