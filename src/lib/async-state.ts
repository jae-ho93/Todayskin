/**
 * R27: 서버에서 가져오는 값 하나의 상태.
 *
 * 화면마다 `loading`/`error`/`data`를 따로 useState로 들고 있으면
 * "로딩 중인데 동시에 실패" 같은 불가능한 조합이 표현 가능해지고, 렌더 분기에서
 * 어떤 조합을 빠뜨렸는지 알기 어렵다. 한 값으로 묶어 그 조합을 없앤다.
 *
 * `empty`는 "요청은 성공했는데 보여줄 게 아직 없음"이다(예: 첫 촬영 전).
 * 실패(`error`)와 구분해야 화면이 재시도 대신 안내를 보여줄 수 있다.
 */
export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'error' };

export const loadingState = { status: 'loading' } as const;
export const emptyState = { status: 'empty' } as const;
export const errorState = { status: 'error' } as const;

export function successState<T>(data: T): AsyncState<T> {
  return { status: 'success', data };
}

/** 성공 상태면 값을, 아니면 null을 준다. 렌더에서 옵셔널 체인 대신 쓴다. */
export function dataOf<T>(state: AsyncState<T>): T | null {
  return state.status === 'success' ? state.data : null;
}
