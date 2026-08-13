import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLabReportEnabled, setLabReportEnabled } from '../lab';

const asyncStore = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;
const LAB_KEY = 'todayskin.lab.aiDetailReport.v1';

beforeEach(() => {
  jest.restoreAllMocks();
  asyncStore.clear();
});

describe('실험실 리포트 플래그 (F79)', () => {
  it('저장된 값이 없으면 꺼짐(기본 숨김)이다', async () => {
    await expect(getLabReportEnabled()).resolves.toBe(false);
  });

  it('켜면 저장되고 다시 읽으면 켜져 있다', async () => {
    await expect(setLabReportEnabled(true)).resolves.toBe(true);
    await expect(getLabReportEnabled()).resolves.toBe(true);
    expect(asyncStore.get(LAB_KEY)).toBe('true');
  });

  it('끄면 키가 지워지고 꺼짐으로 읽힌다', async () => {
    await setLabReportEnabled(true);
    await expect(setLabReportEnabled(false)).resolves.toBe(true);
    await expect(getLabReportEnabled()).resolves.toBe(false);
    expect(asyncStore.has(LAB_KEY)).toBe(false);
  });

  it('알 수 없는 값은 꺼짐으로 취급한다', async () => {
    asyncStore.set(LAB_KEY, 'yes-please');
    await expect(getLabReportEnabled()).resolves.toBe(false);
  });

  it('저장소 읽기 실패 시 안전한 쪽(숨김)으로 간다', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage broken'));
    await expect(getLabReportEnabled()).resolves.toBe(false);
  });

  it('저장 실패 시 false를 돌려줘 호출부가 롤백할 수 있다', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage broken'));
    await expect(setLabReportEnabled(true)).resolves.toBe(false);
  });
});
