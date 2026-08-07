import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface UserCoords {
  latitude: number;
  longitude: number;
}

interface LocationState {
  coords: UserCoords | null;
  permissionDenied: boolean;
  loading: boolean;
}

const LocationContext = createContext<LocationState>({ coords: null, permissionDenied: false, loading: true });

// 재시도 간격(ms). 앱 부팅 직후엔 GPS/권한 초기화가 끝나기 전이라 첫 조회가 실패하기 쉬워서
// 실패해도 몇 번 더 시도해본다. 뒤쪽 두 번은 "캐시된 오래된 위치로 폴백된 채 실내에 머무는"
// 상황을 대비해 더 길게 잡아둔다.
const RETRY_DELAYS_MS = [3000, 8000, 20000, 60000, 120000];

// 캐시된 마지막 위치(getLastKnownPositionAsync)가 이보다 오래됐으면 "일단 보여주되 계속 재시도"
// 대상으로 취급한다 — 다른 지역에서 마지막으로 잡힌 오래된 캐시에 영구히 고정되는 걸 막는다.
const STALE_LAST_KNOWN_MS = 5 * 60 * 1000;

// 화면마다 위치를 따로 조회하면 각자 다른 시점에 GPS를 읽어서 좌표가 미세하게 달라지고, 그 결과
// 홈/날씨상세 등 화면마다 다른 지역명이 뜨는 문제가 있었다. 앱 루트에서 딱 한 번만 조회해 모든
// 화면이 같은 좌표를 보도록 Context로 공유한다.
export function LocationProvider({ children }: { children: ReactNode }) {
  const [coords, setCoords] = useState<UserCoords | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasCoordsRef = useRef(false);
  const inFlightRef = useRef(false);

  const fetchLocation = useCallback(async () => {
    if (hasCoordsRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[LocationProvider] 위치 권한이 허용되지 않음:', status);
        setPermissionDenied(true);
        return;
      }

      try {
        // Balanced(100m 오차 허용)는 GPS 위성 fix 대신 WiFi/기지국 기반 위치를 빠르게 반환할 수
        // 있고, 통신사 기지국 위치 DB가 틀리면 실제 위치와 수십~수백km 차이가 날 수 있다.
        // High(10m 오차)로 올려서 실제 GPS fix를 우선하게 한다 — 응답은 조금 느려질 수 있음.
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        hasCoordsRef.current = true;
        setPermissionDenied(false);
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        return;
      } catch (e) {
        // 실내 등 GPS fix가 안 잡히는 환경에서 흔히 발생 — 바로 폴백하지 않고 캐시된 위치를 한 번 더 시도
        console.warn('[LocationProvider] getCurrentPositionAsync 실패, 마지막 위치로 재시도:', e);
      }

      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        const age = Date.now() - lastKnown.timestamp;
        const isFresh = age < STALE_LAST_KNOWN_MS;
        console.warn(
          `[LocationProvider] 마지막으로 알려진 위치 사용 (${Math.round(age / 1000)}초 전, ${isFresh ? '신선함' : '오래됨 — 계속 재시도'}):`,
          lastKnown.coords,
        );
        // 신선한 캐시만 "다 됐다"로 취급해 재시도를 멈춘다. 오래된 캐시는 일단 화면에 보여주되
        // (아예 안 보여주는 것보단 나음) hasCoordsRef를 세우지 않아 다음 재시도에서 실시간 위치로
        // 교체될 수 있게 둔다.
        if (isFresh) hasCoordsRef.current = true;
        setPermissionDenied(false);
        setCoords({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude });
      } else {
        console.warn('[LocationProvider] 마지막으로 알려진 위치도 없음 — 잠시 후 재시도');
        setPermissionDenied(true);
      }
    } catch (e) {
      console.warn('[LocationProvider] 위치 조회 중 예외 발생:', e);
      setPermissionDenied(true);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocation();

    const timers = RETRY_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        fetchLocation();
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [fetchLocation]);

  return <LocationContext.Provider value={{ coords, permissionDenied, loading }}>{children}</LocationContext.Provider>;
}

export function useUserLocation() {
  return useContext(LocationContext);
}
