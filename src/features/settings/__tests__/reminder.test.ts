import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  cancelReminder,
  DEFAULT_REMINDER_TIME,
  ensureReminderPermission,
  formatReminderTime,
  getStoredReminderTime,
  scheduleReminder,
  storeReminderTime,
} from '../reminder';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'skin-check-reminder'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const asyncStore = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  jest.clearAllMocks();
  asyncStore.clear();
});

describe('리마인더 시간 저장 (F73)', () => {
  it('저장된 값이 없으면 기본 22:00을 준다', async () => {
    await expect(getStoredReminderTime()).resolves.toEqual(DEFAULT_REMINDER_TIME);
  });

  it('저장한 시간을 그대로 돌려준다', async () => {
    await storeReminderTime({ hour: 21, minute: 30 });
    await expect(getStoredReminderTime()).resolves.toEqual({ hour: 21, minute: 30 });
  });

  it('깨진 값·범위 밖 값은 기본값으로 대체한다', async () => {
    asyncStore.set('todayskin.reminder.time.v1', 'not-json');
    await expect(getStoredReminderTime()).resolves.toEqual(DEFAULT_REMINDER_TIME);

    asyncStore.set('todayskin.reminder.time.v1', JSON.stringify({ hour: 25, minute: 0 }));
    await expect(getStoredReminderTime()).resolves.toEqual(DEFAULT_REMINDER_TIME);
  });

  it('HH:MM 형식으로 표시한다', () => {
    expect(formatReminderTime({ hour: 9, minute: 5 })).toBe('09:05');
    expect(formatReminderTime({ hour: 22, minute: 0 })).toBe('22:00');
  });
});

describe('알림 권한 (F73)', () => {
  it('이미 허용돼 있으면 다시 묻지 않는다', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    await expect(ensureReminderPermission()).resolves.toBe(true);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('미결정이면 요청하고 그 결과를 따른다', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
    await expect(ensureReminderPermission()).resolves.toBe(true);
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('다시 물을 수 없게 거부된 상태면 요청 없이 false', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    await expect(ensureReminderPermission()).resolves.toBe(false);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('리마인더 스케줄 (F73)', () => {
  it('기존 등록을 지우고 매일 반복으로 등록한다', async () => {
    await scheduleReminder({ hour: 22, minute: 0 });

    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('skin-check-reminder');
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'skin-check-reminder',
        trigger: expect.objectContaining({ type: 'daily', hour: 22, minute: 0 }),
      }),
    );
  });

  it('해제는 등록된 알림만 지운다', async () => {
    await cancelReminder();
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('skin-check-reminder');
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('지울 알림이 없어 실패해도 조용히 넘어간다', async () => {
    mocked.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('none'));
    await expect(cancelReminder()).resolves.toBeUndefined();
  });
});
