import { act } from 'react-test-renderer';
import * as Notifications from 'expo-notifications';
import { api } from '../../../api/client';
import { flush, renderHook } from '../../../test-utils/renderHook';
import { useSkinReminder } from '../useSkinReminder';
import type { NotificationPreferences } from '../../../types';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'skin-check-reminder'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;

function serverPrefs(morningReminder: boolean): NotificationPreferences {
  return {
    userId: 1,
    pushEnabled: false,
    uvAlertEnabled: false,
    dustAlertEnabled: false,
    morningReminder,
    pushDeliveryAvailable: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // mockResolvedValue는 clearAllMocks로 초기화되지 않아 테스트 간 누수된다 — 기본값을 매번 고정.
  mocked.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
  mocked.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
  jest.spyOn(api, 'getNotificationPreferences').mockResolvedValue(serverPrefs(false));
  jest.spyOn(api, 'updateNotificationPreferences').mockResolvedValue(serverPrefs(true));
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function setup() {
  const rendered = renderHook(() => useSkinReminder());
  await flush();
  return rendered;
}

describe('useSkinReminder (F73)', () => {
  it('서버에 켜져 있고 권한도 있으면 켜짐으로 보이고 스케줄을 보정한다', async () => {
    jest.spyOn(api, 'getNotificationPreferences').mockResolvedValue(serverPrefs(true));

    const { result } = await setup();

    expect(result.current.state).toMatchObject({ status: 'ready', enabled: true });
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalled();
  });

  it('서버에 켜져 있어도 OS 권한이 없으면 꺼짐으로 보인다 — 거짓 토글 금지', async () => {
    jest.spyOn(api, 'getNotificationPreferences').mockResolvedValue(serverPrefs(true));
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);

    const { result } = await setup();

    expect(result.current.state).toMatchObject({ status: 'ready', enabled: false });
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('켜면 서버 저장(morningReminder) 후 로컬 알림을 등록한다', async () => {
    const { result } = await setup();

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(api.updateNotificationPreferences).toHaveBeenCalledWith({ morningReminder: true });
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ type: 'daily', hour: 22, minute: 0 }),
      }),
    );
    expect(result.current.state).toMatchObject({ enabled: true, permissionDenied: false });
  });

  it('권한이 최종 거부면 서버 저장 없이 안내 상태가 된다', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);

    const { result } = await setup();
    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(api.updateNotificationPreferences).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ enabled: false, permissionDenied: true });
  });

  it('끄면 서버 저장 후 로컬 알림을 해제한다', async () => {
    jest.spyOn(api, 'getNotificationPreferences').mockResolvedValue(serverPrefs(true));

    const { result } = await setup();
    mocked.cancelScheduledNotificationAsync.mockClear();

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(api.updateNotificationPreferences).toHaveBeenCalledWith({ morningReminder: false });
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('skin-check-reminder');
    expect(result.current.state).toMatchObject({ enabled: false });
  });

  it('서버 저장 실패 시 토글을 되돌리고 스케줄을 만들지 않는다', async () => {
    jest.spyOn(api, 'updateNotificationPreferences').mockRejectedValue(new Error('save'));

    const { result } = await setup();
    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.state).toMatchObject({
      enabled: false,
      saveError: '리마인더 설정 저장에 실패했어요',
    });
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('시간을 바꾸면 저장하고, 켜져 있으면 다시 스케줄한다', async () => {
    jest.spyOn(api, 'getNotificationPreferences').mockResolvedValue(serverPrefs(true));

    const { result } = await setup();
    mocked.scheduleNotificationAsync.mockClear();

    await act(async () => {
      await result.current.setTime({ hour: 21, minute: 0 });
    });

    expect(result.current.state).toMatchObject({ time: { hour: 21, minute: 0 } });
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ hour: 21, minute: 0 }),
      }),
    );
  });
});
