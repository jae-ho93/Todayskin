import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';

interface Preferences {
  /** 자외선+미세먼지 경보를 함께 제어하는 스위치 */
  weatherAlert: boolean;
  recommendAlert: boolean;
  /** 기기/서버가 실제로 푸시를 보낼 수 있는 상태인지 — 아니면 스위치를 잠근다 */
  pushDeliveryAvailable: boolean;
}

/**
 * R27: 알림 설정 화면의 상태.
 *
 * `ready`에만 `saveError`가 있다 — 저장 실패는 값이 이미 있을 때만 의미가 있고,
 * "불러오기 실패"(error)와 섞이면 화면이 어느 쪽을 보여줄지 애매해진다.
 */
export type PreferencesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; prefs: Preferences; saveError: string | null };

const SAVE_FAILED = '알림 설정 저장에 실패했어요';

export function useNotificationPreferences() {
  const [state, setState] = useState<PreferencesState>({ status: 'loading' });
  // 낙관적 갱신 중 연타로 요청이 뒤섞이지 않도록 저장 완료까지 토글을 잠근다.
  const savingRef = useRef(false);
  // 롤백할 직전 값은 setState 업데이터 밖에서 읽어야 한다 — 업데이터는 React가
  // 렌더 시점에 부를 수 있어서 그 안에서 값을 꺼내오면 타이밍을 보장할 수 없다.
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const prefs = await api.getNotificationPreferences();
    if (!prefs) {
      setState({ status: 'error' });
      return;
    }
    setState({
      status: 'ready',
      saveError: null,
      prefs: {
        // 둘 중 하나라도 켜져 있으면 on으로 표시해, 부분 설정이 "꺼짐"으로 잘못 보였다가
        // 토글이 다른 쪽 설정을 덮어쓰지 않게 한다.
        weatherAlert: prefs.uvAlertEnabled || prefs.dustAlertEnabled,
        recommendAlert: prefs.pushEnabled,
        pushDeliveryAvailable: prefs.pushDeliveryAvailable === true,
      },
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 스위치를 먼저 움직이고, 저장이 실패하면 되돌린다. */
  const toggle = useCallback(
    async (key: 'weatherAlert' | 'recommendAlert', value: boolean) => {
      const current = stateRef.current;
      if (savingRef.current || current.status !== 'ready') return;
      savingRef.current = true;

      const previous = current.prefs;
      setState({
        status: 'ready',
        prefs: { ...previous, [key]: value },
        saveError: null,
      });

      try {
        await api.updateNotificationPreferences(
          key === 'weatherAlert'
            ? { uvAlertEnabled: value, dustAlertEnabled: value }
            : { pushEnabled: value },
        );
        setState((prev) => (prev.status === 'ready' ? { ...prev, saveError: null } : prev));
      } catch {
        // 실패 시 롤백 — 스위치가 서버 상태와 다르게 켜진 채 남지 않게 한다.
        setState((prev) =>
          prev.status === 'ready' ? { ...prev, prefs: previous, saveError: SAVE_FAILED } : prev,
        );
      } finally {
        savingRef.current = false;
      }
    },
    [],
  );

  return { state, toggle, reload: load };
}
