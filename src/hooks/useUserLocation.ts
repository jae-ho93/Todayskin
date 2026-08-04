import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useRef, useState } from 'react';

export interface UserCoords {
  latitude: number;
  longitude: number;
}

// 위치 권한을 거부하거나 실패해도 null을 반환할 뿐 화면을 막지 않는다 — 호출부는 기본 지역(서울)으로 폴백
export function useUserLocation() {
  const [coords, setCoords] = useState<UserCoords | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  // 홈 탭처럼 앱 부팅 직후 마운트되는 화면은 GPS/권한 초기화가 끝나기 전에 첫 조회가 실패할 수 있다.
  // coords를 아직 못 구했으면 화면이 다시 포커스될 때마다(탭 복귀 등) 재시도한다.
  const hasCoordsRef = useRef(false);
  const inFlightRef = useRef(false);

  const fetchLocation = useCallback(async () => {
    if (hasCoordsRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[useUserLocation] 위치 권한이 허용되지 않음:', status);
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
        console.warn('[useUserLocation] getCurrentPositionAsync 실패, 마지막 위치로 재시도:', e);
      }

      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        console.warn('[useUserLocation] 마지막으로 알려진 위치 사용:', lastKnown.coords);
        hasCoordsRef.current = true;
        setPermissionDenied(false);
        setCoords({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude });
      } else {
        console.warn('[useUserLocation] 마지막으로 알려진 위치도 없음 — 기본 지역으로 폴백, 다음 포커스 때 재시도');
        setPermissionDenied(true);
      }
    } catch (e) {
      console.warn('[useUserLocation] 위치 조회 중 예외 발생:', e);
      setPermissionDenied(true);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLocation();
    }, [fetchLocation])
  );

  return { coords, permissionDenied, loading };
}
