import { groupRoutineByPhase } from '../care-routine';
import type { CareRoutineStep } from '../../types';

function step(overrides: Partial<CareRoutineStep>): CareRoutineStep {
  return {
    phase: '외출 후(세안 후)',
    step: '보습',
    ingredient: null,
    amount: null,
    reason: '기본 이유',
    evidence: null,
    ...overrides,
  };
}

describe('groupRoutineByPhase', () => {
  it('phase가 처음 등장한 순서대로 그룹을 만들고, 각 단계를 그 안에 순서대로 담는다', () => {
    const routine = [
      step({ phase: '외출 후(세안 후)', step: '토너' }),
      step({ phase: '자기 전', step: '크림' }),
      step({ phase: '외출 후(세안 후)', step: '세럼' }),
    ];

    const groups = groupRoutineByPhase(routine);

    expect(groups.map((g) => g.phase)).toEqual(['외출 후(세안 후)', '자기 전']);
    expect(groups[0].steps.map((s) => s.step)).toEqual(['토너', '세럼']);
    expect(groups[1].steps.map((s) => s.step)).toEqual(['크림']);
  });

  it('그룹의 reason은 그 phase에서 처음 등장한 단계의 reason을 쓴다', () => {
    const routine = [
      step({ phase: '외출 후(세안 후)', step: '토너', reason: '공통 이유' }),
      step({ phase: '외출 후(세안 후)', step: '세럼', reason: '다른 이유' }),
    ];

    const groups = groupRoutineByPhase(routine);

    expect(groups[0].reason).toBe('공통 이유');
  });

  it('빈 routine이면 빈 배열을 반환한다', () => {
    expect(groupRoutineByPhase([])).toEqual([]);
  });
});
