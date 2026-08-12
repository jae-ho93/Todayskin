import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * F73: "자기 전 피부 체크" 로컬 리마인더.
 * 서버 푸시 인프라(FCM/APNs) 없이 기기 로컬 알림만으로 동작한다.
 * 켜짐/꺼짐은 서버 NotificationPreference.morningReminder와 동기화하고(계약 변경 없음),
 * 시간은 서버 스키마에 없어 기기(AsyncStorage)에만 저장한다.
 */

export interface ReminderTime {
  hour: number;
  minute: number;
}

export const DEFAULT_REMINDER_TIME: ReminderTime = { hour: 22, minute: 0 };

/** 자기 전 체크 목적에 맞는 선택지 — 커스텀 피커 대신 프리셋으로 단순하게 유지한다. */
export const REMINDER_TIME_OPTIONS: ReminderTime[] = [
  { hour: 20, minute: 0 },
  { hour: 21, minute: 0 },
  { hour: 22, minute: 0 },
  { hour: 23, minute: 0 },
];

const TIME_STORAGE_KEY = 'todayskin.reminder.time.v1';
const REMINDER_ID = 'skin-check-reminder';
const ANDROID_CHANNEL_ID = 'skin-reminder';

export function formatReminderTime(time: ReminderTime): string {
  const hh = String(time.hour).padStart(2, '0');
  const mm = String(time.minute).padStart(2, '0');
  return `${hh}:${mm}`;
}

export async function getStoredReminderTime(): Promise<ReminderTime> {
  try {
    const raw = await AsyncStorage.getItem(TIME_STORAGE_KEY);
    if (!raw) return DEFAULT_REMINDER_TIME;
    const parsed = JSON.parse(raw) as Partial<ReminderTime>;
    if (
      typeof parsed.hour !== 'number' ||
      typeof parsed.minute !== 'number' ||
      parsed.hour < 0 ||
      parsed.hour > 23 ||
      parsed.minute < 0 ||
      parsed.minute > 59
    ) {
      return DEFAULT_REMINDER_TIME;
    }
    return { hour: parsed.hour, minute: parsed.minute };
  } catch {
    return DEFAULT_REMINDER_TIME;
  }
}

export async function storeReminderTime(time: ReminderTime): Promise<void> {
  await AsyncStorage.setItem(TIME_STORAGE_KEY, JSON.stringify(time));
}

/** Android 13+는 알림 채널이 있어야 권한 프롬프트가 뜬다 — 권한 요청 전에 보장한다. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: '피부 체크 리마인더',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** 알림 권한 확인·요청. 사용자가 이미 거부해 다시 물을 수 없으면 false. */
export async function ensureReminderPermission(): Promise<boolean> {
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

/** 권한을 새로 요청하지 않고 현재 허용 여부만 본다 (로드 시 상태 보정용). */
export async function hasReminderPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
}

/** 매일 지정 시각 반복 알림을 (재)등록한다. 같은 identifier라 중복 등록되지 않는다. */
export async function scheduleReminder(time: ReminderTime): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: '자기 전 피부 체크',
      body: '오늘 피부 상태를 기록해보세요. 기록이 쌓일수록 날씨와의 패턴이 선명해져요.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

export async function cancelReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
}
