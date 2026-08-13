import { act } from 'react-test-renderer';
import type * as NetworkTypes from 'expo-network';
import { flush, renderHook } from '../../test-utils/renderHook';
import { isOfflineState, useOffline } from '../useOffline';

type NetState = Pick<NetworkTypes.NetworkState, 'isConnected' | 'isInternetReachable'>;
type Listener = (state: NetState) => void;

const mockListeners: Listener[] = [];
const mockRemove = jest.fn();
let mockNetworkState: NetState = { isConnected: true, isInternetReachable: true };

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(() => Promise.resolve(mockNetworkState)),
  addNetworkStateListener: jest.fn((cb: Listener) => {
    mockListeners.push(cb);
    return { remove: mockRemove };
  }),
}));

beforeEach(() => {
  mockListeners.length = 0;
  mockRemove.mockClear();
  mockNetworkState = { isConnected: true, isInternetReachable: true };
});

describe('isOfflineState (F82)', () => {
  it('확실히 끊겼을 때만 오프라인이다', () => {
    expect(isOfflineState({ isConnected: false, isInternetReachable: false })).toBe(true);
    expect(isOfflineState({ isConnected: true, isInternetReachable: false })).toBe(true);
    expect(isOfflineState({ isConnected: false, isInternetReachable: undefined })).toBe(true);
  });

  it('모르는 상태(undefined)는 온라인으로 취급한다 — 시작 직후 오탐 배너 방지', () => {
    expect(isOfflineState({ isConnected: undefined, isInternetReachable: undefined })).toBe(false);
    expect(isOfflineState({ isConnected: true, isInternetReachable: undefined })).toBe(false);
    expect(isOfflineState({ isConnected: true, isInternetReachable: true })).toBe(false);
  });
});

describe('useOffline (F82)', () => {
  it('초기 상태를 조회해 반영한다', async () => {
    mockNetworkState = { isConnected: false, isInternetReachable: false };
    const { result } = renderHook(() => useOffline());
    expect(result.current).toBe(false);
    await flush();
    expect(result.current).toBe(true);
  });

  it('리스너로 상태 변화를 따라간다 (오프라인 → 온라인 → 오프라인)', async () => {
    mockNetworkState = { isConnected: false, isInternetReachable: false };
    const { result } = renderHook(() => useOffline());
    await flush();
    expect(result.current).toBe(true);

    act(() => {
      for (const cb of mockListeners) cb({ isConnected: true, isInternetReachable: true });
    });
    expect(result.current).toBe(false);

    act(() => {
      for (const cb of mockListeners) cb({ isConnected: false, isInternetReachable: false });
    });
    expect(result.current).toBe(true);
  });

  it('언마운트 시 구독을 해제한다', async () => {
    const { unmount } = renderHook(() => useOffline());
    await flush();
    expect(mockListeners.length).toBe(1);
    unmount();
    expect(mockRemove).toHaveBeenCalled();
  });
});
