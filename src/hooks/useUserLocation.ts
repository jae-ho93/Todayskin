import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export interface UserCoords {
  latitude: number;
  longitude: number;
}

// 위치 권한을 거부하거나 실패해도 null을 반환할 뿐 화면을 막지 않는다 — 호출부는 기본 지역(서울)으로 폴백
export function useUserLocation() {
  const [coords, setCoords] = useState<UserCoords | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function requestLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('[useUserLocation] 위치 권한이 허용되지 않음:', status);
          if (!cancelled) setPermissionDenied(true);
          return;
        }

        try {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!cancelled) {
            setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          }
          return;
        } catch (e) {
          // 실내 등 GPS fix가 안 잡히는 환경에서 흔히 발생 — 바로 폴백하지 않고 캐시된 위치를 한 번 더 시도
          console.warn('[useUserLocation] getCurrentPositionAsync 실패, 마지막 위치로 재시도:', e);
        }

        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown && !cancelled) {
          console.warn('[useUserLocation] 마지막으로 알려진 위치 사용:', lastKnown.coords);
          setCoords({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude });
        } else if (!cancelled) {
          console.warn('[useUserLocation] 마지막으로 알려진 위치도 없음 — 기본 지역으로 폴백');
          setPermissionDenied(true);
        }
      } catch (e) {
        console.warn('[useUserLocation] 위치 조회 중 예외 발생:', e);
        if (!cancelled) setPermissionDenied(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    requestLocation();
    return () => {
      cancelled = true;
    };
  }, []);

  return { coords, permissionDenied, loading };
}
