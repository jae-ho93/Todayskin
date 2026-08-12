import TestRenderer, { act } from 'react-test-renderer';

/**
 * 훅 하나만 실행하는 최소 하네스.
 *
 * @testing-library/react-native의 renderHook은 이 저장소의 jest-expo 조합에서
 * result를 채우지 못해서(빈 객체 반환) 쓰지 않는다. 훅 테스트는 호스트 컴포넌트를
 * 그리지 않으므로 react-test-renderer로 충분하다.
 */
export function renderHook<T>(useHook: () => T) {
  const result = { current: undefined as T };
  let renderer: TestRenderer.ReactTestRenderer | undefined;

  function Probe() {
    result.current = useHook();
    return null;
  }

  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });

  return {
    result,
    rerender: () => act(() => renderer?.update(<Probe />)),
    unmount: () => act(() => renderer?.unmount()),
  };
}

/** 대기 중인 마이크로태스크를 흘려보내 상태 갱신을 반영한다. */
export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
