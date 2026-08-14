import type { CareRoutineStep } from '../types';

export interface CareRoutinePhaseGroup {
  phase: string;
  /** 같은 phase의 모든 단계가 공유하는 이유(서버가 phase당 한 문장으로 통일해서 보낸다). */
  reason: string;
  /** 화장품을 바르는 순서 그대로. */
  steps: CareRoutineStep[];
}

/** routine을 phase별로 묶는다 — 처음 등장한 순서대로 그룹이 만들어진다(바르는 순서 유지). */
export function groupRoutineByPhase(routine: CareRoutineStep[]): CareRoutinePhaseGroup[] {
  const groups: CareRoutinePhaseGroup[] = [];
  const indexByPhase = new Map<string, number>();
  for (const step of routine) {
    let idx = indexByPhase.get(step.phase);
    if (idx === undefined) {
      idx = groups.length;
      indexByPhase.set(step.phase, idx);
      groups.push({ phase: step.phase, reason: step.reason, steps: [] });
    }
    groups[idx].steps.push(step);
  }
  return groups;
}
