import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react-test-renderer';
import { flush, renderHook } from '../../../test-utils/renderHook';
import { useLabReport } from '../useLabReport';

const asyncStore = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  jest.restoreAllMocks();
  asyncStore.clear();
});

async function setup() {
  const rendered = renderHook(() => useLabReport());
  await flush();
  return rendered;
}

describe('useLabReport (F79)', () => {
  it('처음에는 꺼짐(기본 숨김)으로 로드된다', async () => {
    const { result } = await setup();
    expect(result.current.state).toEqual({ status: 'ready', enabled: false, saveError: null });
  });

  it('저장돼 있으면 켜짐으로 로드된다', async () => {
    asyncStore.set('todayskin.lab.aiDetailReport.v1', 'true');
    const { result } = await setup();
    expect(result.current.state).toMatchObject({ status: 'ready', enabled: true });
  });

  it('켜면 즉시 반영되고 저장된다', async () => {
    const { result } = await setup();

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.state).toMatchObject({ status: 'ready', enabled: true, saveError: null });
    expect(asyncStore.get('todayskin.lab.aiDetailReport.v1')).toBe('true');
  });

  it('저장 실패 시 토글을 롤백하고 오류를 보여준다', async () => {
    const { result } = await setup();
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage broken'));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.state).toMatchObject({
      status: 'ready',
      enabled: false,
      saveError: '실험실 설정 저장에 실패했어요',
    });
  });
});
