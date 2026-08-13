import type { ScoreSeriesPoint } from '../types';
import { kstDaysAgo } from './kst-date';

/**
 * F80: 주간 요약 — 최근 7일(오늘 포함)과 직전 7일을 비교한다.
 *
 * 서버 score-series를 그대로 집계하는 파생 뷰라 클라이언트에서 계산한다
 * (API freeze 준수 — 서버 계약 변경 없음). 날짜 문자열은 서버와 같은
 * Asia/Seoul `YYYY-MM-DD`이므로 사전순 비교가 곧 날짜 비교다.
 */
export interface WeeklySummary {
  /** 최근 7일(오늘 포함) 측정 횟수 */
  count: number;
  /** 최근 7일 평균 종합 점수 — 측정이 없으면 null */
  avgScore: number | null;
  /** 직전 7일 평균 — 측정이 없으면 null */
  prevAvgScore: number | null;
  /** 전주 대비 변화(점) — 두 평균이 모두 있을 때만 */
  delta: number | null;
}

function average(points: ScoreSeriesPoint[]): number | null {
  if (points.length === 0) return null;
  return Math.round(points.reduce((sum, p) => sum + p.overallScore, 0) / points.length);
}

export function buildWeeklySummary(points: ScoreSeriesPoint[], today: string): WeeklySummary {
  const weekStart = kstDaysAgo(6, today);
  const prevStart = kstDaysAgo(13, today);
  const prevEnd = kstDaysAgo(7, today);

  const thisWeek = points.filter((p) => p.date >= weekStart && p.date <= today);
  const prevWeek = points.filter((p) => p.date >= prevStart && p.date <= prevEnd);

  const avgScore = average(thisWeek);
  const prevAvgScore = average(prevWeek);

  return {
    count: thisWeek.length,
    avgScore,
    prevAvgScore,
    delta: avgScore !== null && prevAvgScore !== null ? avgScore - prevAvgScore : null,
  };
}

/** 주간 요약에 필요한 조회 범위 — 오늘 기준 14일 (서버 from/to는 양끝 포함) */
export function weeklySummaryBounds(today: string): { from: string; to: string } {
  return { from: kstDaysAgo(13, today), to: today };
}
