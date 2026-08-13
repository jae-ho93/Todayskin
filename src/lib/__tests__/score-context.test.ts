import type { ScoreSeriesPoint } from '../../types';
import { resolveScoreContext } from '../score-context';

function point(id: string, date: string, overallScore: number): ScoreSeriesPoint {
  return { date, diagnosisId: id, capturedAt: `${date}T21:00:00.000Z`, overallScore };
}

describe('resolveScoreContext (F81)', () => {
  it('시리즈가 없으면 아무것도 내지 않는다', () => {
    expect(resolveScoreContext(undefined, 'd1', 80)).toEqual({
      change: null,
      isFirstMeasurement: false,
    });
    expect(resolveScoreContext([], 'd1', 80)).toEqual({
      change: null,
      isFirstMeasurement: false,
    });
  });

  it('이 진단이 시리즈에 없으면 첫 측정으로 단정하지 않는다', () => {
    const points = [point('other', '2026-08-12', 70)];
    expect(resolveScoreContext(points, 'd1', 80)).toEqual({
      change: null,
      isFirstMeasurement: false,
    });
  });

  it('시리즈의 가장 오래된 기록이면 첫 측정이다', () => {
    const points = [point('d1', '2026-08-13', 80)];
    expect(resolveScoreContext(points, 'd1', 80)).toEqual({
      change: null,
      isFirstMeasurement: true,
    });
  });

  it('직전 측정보다 오르면 ▲', () => {
    const points = [point('d0', '2026-08-12', 72), point('d1', '2026-08-13', 80)];
    expect(resolveScoreContext(points, 'd1', 80)).toEqual({
      change: { label: '▲ 8점', up: true },
      isFirstMeasurement: false,
    });
  });

  it('직전 측정보다 내리면 ▼', () => {
    const points = [point('d0', '2026-08-12', 80), point('d1', '2026-08-13', 64)];
    expect(resolveScoreContext(points, 'd1', 64)).toEqual({
      change: { label: '▼ 16점', up: false },
      isFirstMeasurement: false,
    });
  });

  it('같으면 "지난 측정과 동일"', () => {
    const points = [point('d0', '2026-08-12', 80), point('d1', '2026-08-13', 80)];
    expect(resolveScoreContext(points, 'd1', 80)).toEqual({
      change: { label: '지난 측정과 동일', up: null },
      isFirstMeasurement: false,
    });
  });
});
