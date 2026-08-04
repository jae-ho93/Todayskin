/**
 * 날씨 캐시 key 정책 — T12.
 *
 * Key 구조: weather:current:{regionKey}:{coordKey?}
 * - regionKey: regionName (공백은 '-'로 정규화). 좌표 없으면 기본 지역 fallback 키.
 * - coordKey: lat/lon을 소수점 2자리로 반올림해 동일 좌표 근처 요청을 그룹화.
 *   GPS 미세 오차로 인한 캐시 hit 감소를 방지하기 위한 근사 그룹화다.
 *
 * 캐시 범위:
 * - getCurrentWeather(HTTP /weather)만 캐시한다. 사용자 응답용이므로 약간의 지연 허용 가능.
 * - getOrCreateSnapshot(진단/추천 연결용)은 캐시하지 않는다. 재현성·정확성이
 *   진단 품질에 직결되므로 매 호출마다 외부 API에서 최신값을 확보한다.
 */
export function weatherCacheKey(
  regionName: string,
  lat?: number,
  lon?: number,
): string {
  const region = normalize(regionName);
  if (lat !== undefined && lon !== undefined) {
    const latKey = lat.toFixed(2);
    const lonKey = lon.toFixed(2);
    return `weather:current:${region}:${latKey}:${lonKey}`;
  }
  return `weather:current:${region}:default`;
}

/** 공백/특수문자 정규화 — Redis key에 안전한 문자만 남긴다. */
function normalize(s: string): string {
  return s.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9가-힣\-:_]/g, '');
}

/** 캐시에 저장되는 응답 캡슐. source는 CACHED로 override된다. */
export interface CachedWeather {
  dto: unknown;
  cachedAt: string;
}
