import type { ScoreSeriesPoint } from '../../types';
import { buildWeeklySummary, weeklySummaryBounds } from '../weekly-summary';

const TODAY = '2026-08-13';

function point(date: string, overallScore: number): ScoreSeriesPoint {
  return { date, diagnosisId: `diag-${date}-${overallScore}`, capturedAt: `${date}T21:00:00.000Z`, overallScore };
}

describe('buildWeeklySummary (F80)', () => {
  it('기록이 없으면 0회·평균 없음이다', () => {
    expect(buildWeeklySummary([], TODAY)).toEqual({
      count: 0,
      avgScore: null,
      prevAvgScore: null,
      delta: null,
    });
  });

  it('이번 주만 있으면 delta 없이 횟수·평균만 나온다', () => {
    const summary = buildWeeklySummary([point('2026-08-13', 80), point('2026-08-11', 70)], TODAY);
    expect(summary).toEqual({ count: 2, avgScore: 75, prevAvgScore: null, delta: null });
  });

  it('지난주만 있으면 이번 주 0회 + 전주 평균만 나온다', () => {
    const summary = buildWeeklySummary([point('2026-08-05', 66)], TODAY);
    expect(summary).toEqual({ count: 0, avgScore: null, prevAvgScore: 66, delta: null });
  });

  it('두 주가 모두 있으면 전주 대비 변화를 계산한다', () => {
    const summary = buildWeeklySummary(
      [
        point('2026-08-13', 82), // 이번 주 (08-07~08-13)
        point('2026-08-07', 78),
        point('2026-08-06', 70), // 지난주 (07-31~08-06)
        point('2026-07-31', 74),
      ],
      TODAY,
    );
    expect(summary).toEqual({ count: 2, avgScore: 80, prevAvgScore: 72, delta: 8 });
  });

  it('경계 날짜가 정확하다 — 7일 전은 지난주, 6일 전은 이번 주', () => {
    const summary = buildWeeklySummary(
      [point('2026-08-07', 100), point('2026-08-06', 50)],
      TODAY,
    );
    expect(summary.count).toBe(1);
    expect(summary.avgScore).toBe(100);
    expect(summary.prevAvgScore).toBe(50);
  });

  it('14일보다 오래된 기록은 무시한다', () => {
    const summary = buildWeeklySummary([point('2026-07-30', 90)], TODAY);
    expect(summary).toEqual({ count: 0, avgScore: null, prevAvgScore: null, delta: null });
  });

  it('같은 날 여러 측정은 각각 센다', () => {
    const summary = buildWeeklySummary(
      [point('2026-08-13', 80), point('2026-08-13', 60)],
      TODAY,
    );
    expect(summary.count).toBe(2);
    expect(summary.avgScore).toBe(70);
  });

  it('평균은 반올림한다', () => {
    const summary = buildWeeklySummary(
      [point('2026-08-13', 71), point('2026-08-12', 70)],
      TODAY,
    );
    expect(summary.avgScore).toBe(71); // 70.5 → 71
  });
});

describe('weeklySummaryBounds (F80)', () => {
  it('오늘 포함 14일 범위를 준다 (월 경계 포함)', () => {
    expect(weeklySummaryBounds('2026-08-13')).toEqual({ from: '2026-07-31', to: '2026-08-13' });
  });
});
