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
// 실패해도 몇 번 더 시도해본다.
const RETRY_DELAYS_MS = [3000, 8000, 20000];

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
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
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
        console.warn('[LocationProvider] 마지막으로 알려진 위치 사용:', lastKnown.coords);
        hasCoordsRef.current = true;
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
