import * as Network from 'expo-network';
import { useEffect, useState } from 'react';

/**
 * F82: 오프라인 판정. undefined(아직 모름)는 온라인으로 취급해 시작 직후
 * 잘못된 배너 깜빡임을 막는다 — 확실히 끊겼을 때만 오프라인이다.
 */
export function isOfflineState(
  state: Pick<Network.NetworkState, 'isConnected' | 'isInternetReachable'>,
): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

/**
 * F82: 네트워크 연결 상태 구독. expo-network 사용
 * (결정: netinfo 대신 Expo 공식 모듈 — 네이티브 설정 불필요, SDK 54 지원).
 */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Network.getNetworkStateAsync()
      .then((state) => {
        if (!cancelled) setOffline(isOfflineState(state));
      })
      .catch(() => {
        // 상태 조회 실패는 오프라인 단정 근거가 아니다 — 배너를 띄우지 않는다.
      });
    const subscription = Network.addNetworkStateListener((state) => {
      setOffline(isOfflineState(state));
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return offline;
}
