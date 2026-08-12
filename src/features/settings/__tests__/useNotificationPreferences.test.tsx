import { act } from 'react-test-renderer';
import { api } from '../../../api/client';
import { flush, renderHook } from '../../../test-utils/renderHook';
import { useNotificationPreferences } from '../useNotificationPreferences';
import type { NotificationPreferences } from '../../../types';

/**
 * R27: 낙관적 토글은 실패하면 되돌려야 하는데, 화면에 흩어져 있을 때는 롤백이
 * 토글마다 복사돼 있었다. 훅으로 모으면서 규칙을 고정한다.
 */

const serverPrefs: NotificationPreferences = {
  userId: 1,
  morningReminder: false,
  pushEnabled: false,
  uvAlertEnabled: true,
  dustAlertEnabled: false,
  pushDeliveryAvailable: true,
};

beforeEach(() => {
  jest.spyOn(api, 'getNotificationPreferences').mockResolvedValue(serverPrefs);
  jest.spyOn(api, 'updateNotificationPreferences').mockResolvedValue(serverPrefs);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function setup() {
  const rendered = renderHook(() => useNotificationPreferences());
  await flush();
  return rendered;
}

describe('useNotificationPreferences', () => {
  it('자외선·미세먼지 중 하나라도 켜져 있으면 날씨 경보를 켜진 것으로 본다', async () => {
    const { result } = await setup();

    expect(result.current.state).toEqual({
      status: 'ready',
      saveError: null,
      prefs: { weatherAlert: true, recommendAlert: false, pushDeliveryAvailable: true },
    });
  });

  it('불러오기에 실패하면 error 상태가 된다', async () => {
    jest.spyOn(api, 'getNotificationPreferences').mockResolvedValue(null);

    const { result } = await setup();

    expect(result.current.state.status).toBe('error');
  });

  it('날씨 경보 토글은 자외선·미세먼지를 함께 보낸다', async () => {
    const { result } = await setup();

    await act(async () => {
      await result.current.toggle('weatherAlert', false);
    });

    expect(api.updateNotificationPreferences).toHaveBeenCalledWith({
      uvAlertEnabled: false,
      dustAlertEnabled: false,
    });
  });

  it('저장이 실패하면 스위치를 되돌리고 오류를 남긴다', async () => {
    jest.spyOn(api, 'updateNotificationPreferences').mockRejectedValue(new Error('save'));
    const { result } = await setup();

    await act(async () => {
      await result.current.toggle('recommendAlert', true);
    });

    expect(result.current.state).toEqual({
      status: 'ready',
      saveError: '알림 설정 저장에 실패했어요',
      prefs: { weatherAlert: true, recommendAlert: false, pushDeliveryAvailable: true },
    });
  });

  it('저장 중에는 다음 토글을 받지 않는다 — 연타로 요청이 뒤섞이지 않게', async () => {
    let resolveSave: (() => void) | undefined;
    jest.spyOn(api, 'updateNotificationPreferences').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = () => resolve(serverPrefs);
        }),
    );
    const { result } = await setup();

    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.toggle('recommendAlert', true);
    });
    await act(async () => {
      await result.current.toggle('weatherAlert', false);
    });

    expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave?.();
      await first;
    });
  });
});
