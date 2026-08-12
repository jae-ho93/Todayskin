import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import {
  cancelReminder,
  ensureReminderPermission,
  getStoredReminderTime,
  hasReminderPermission,
  scheduleReminder,
  storeReminderTime,
  type ReminderTime,
} from './reminder';

/**
 * F73: 피부 체크 리마인더 상태.
 * 켜짐 여부는 서버(morningReminder)가 진실이고, 실제 발송은 로컬 알림이 담당한다.
 * OS 권한이 회수됐으면 알림이 올 수 없으므로 꺼진 것으로 보여준다 — 거짓 토글 금지.
 */
export type SkinReminderState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      enabled: boolean;
      time: ReminderTime;
      /** 권한이 거부돼 켤 수 없는 상태 — 설정 앱 유도 문구를 보여준다 */
      permissionDenied: boolean;
      saveError: string | null;
    };

const SAVE_FAILED = '리마인더 설정 저장에 실패했어요';

export function useSkinReminder() {
  const [state, setState] = useState<SkinReminderState>({ status: 'loading' });
  const savingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const [prefs, time] = await Promise.all([
      api.getNotificationPreferences(),
      getStoredReminderTime(),
    ]);
    if (!prefs) {
      setState({ status: 'error' });
      return;
    }
    const permitted = await hasReminderPermission();
    const enabled = prefs.morningReminder && permitted;
    if (enabled) {
      // 재설치·기기 변경으로 스케줄이 사라졌을 수 있다 — 같은 id라 중복 없이 보정된다.
      await scheduleReminder(time).catch(() => undefined);
    }
    setState({ status: 'ready', enabled, time, permissionDenied: false, saveError: null });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setEnabled = useCallback(async (value: boolean) => {
    const current = stateRef.current;
    if (savingRef.current || current.status !== 'ready') return;
    savingRef.current = true;
    try {
      if (value) {
        const granted = await ensureReminderPermission();
        if (!granted) {
          setState((prev) =>
            prev.status === 'ready' ? { ...prev, enabled: false, permissionDenied: true } : prev,
          );
          return;
        }
      }

      const previous = current;
      setState({ ...previous, enabled: value, permissionDenied: false, saveError: null });
      try {
        await api.updateNotificationPreferences({ morningReminder: value });
      } catch {
        // 서버 저장 실패 시 롤백 — 스케줄도 건드리지 않는다.
        setState((prev) =>
          prev.status === 'ready'
            ? { ...prev, enabled: previous.enabled, saveError: SAVE_FAILED }
            : prev,
        );
        return;
      }

      if (value) {
        await scheduleReminder(current.time).catch(() => undefined);
      } else {
        await cancelReminder();
      }
    } finally {
      savingRef.current = false;
    }
  }, []);

  const setTime = useCallback(async (time: ReminderTime) => {
    const current = stateRef.current;
    if (savingRef.current || current.status !== 'ready') return;
    savingRef.current = true;
    try {
      setState({ ...current, time });
      await storeReminderTime(time);
      if (current.enabled) {
        await scheduleReminder(time).catch(() => undefined);
      }
    } finally {
      savingRef.current = false;
    }
  }, []);

  return { state, setEnabled, setTime, reload: load };
}
