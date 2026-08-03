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
          if (!cancelled) setPermissionDenied(true);
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        }
      } catch {
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
