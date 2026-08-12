import type { WeatherSnapshot as PrismaWeatherSnapshot } from '@prisma/client';
import { AirStatus } from '../../../common/enums/air-status.enum';
import { UvLevel } from '../../../common/enums/uv-level.enum';
import { WeatherSource } from '../../../common/enums/weather-source.enum';
import { WeatherSnapshotDto } from '../dto/weather-snapshot.dto';
import { WeatherStatusPolicy } from '../policies/weather-status.policy';

/**
 * R22: 날씨 지표 16개를 옮기는 코드가 네 곳에 복제돼 있었다
 * (`weather.service`의 DTO 변환·persist, `diagnosis.service`의 캘린더 변환,
 * `product.service`의 스냅샷 변환, `recommendation.service`의 Gemini 입력).
 *
 * 모든 지표가 optional이라 한 곳에서 필드를 빠뜨려도 컴파일러가 잡지 못했고,
 * 실제로 `product.service`가 `districtName`을 누락해 같은 스냅샷이 API에 따라
 * 다르게 보였다. 지표 목록을 한 곳에 두고 복사는 키 배열로 돌린다.
 */

/** 지표 필드 목록. 새 지표를 추가하면 여기에만 넣는다(드리프트는 spec이 잡는다). */
export const WEATHER_METRIC_KEYS = [
  'uvIndex',
  'uvStatus',
  'uvIndexPeak',
  'uvStatusPeak',
  'uvIndexPeakHour',
  'ozonePpm',
  'ozoneStatus',
  'pm25',
  'pm25Status',
  'pm10',
  'pm10Status',
  'caiValue',
  'caiStatus',
  'no2Value',
  'so2Value',
  'coValue',
  'temperature',
  'humidity',
] as const;

export type WeatherMetricKey = (typeof WEATHER_METRIC_KEYS)[number];

/** 지표 값 묶음. Prisma `WeatherSnapshot`과 DTO가 공유하는 부분집합이다. */
export type WeatherMetrics = {
  uvIndex: number | null;
  uvStatus: UvLevel | null;
  uvIndexPeak: number | null;
  uvStatusPeak: UvLevel | null;
  uvIndexPeakHour: number | null;
  ozonePpm: number | null;
  ozoneStatus: AirStatus | null;
  pm25: number | null;
  pm25Status: AirStatus | null;
  pm10: number | null;
  pm10Status: AirStatus | null;
  caiValue: number | null;
  caiStatus: AirStatus | null;
  no2Value: number | null;
  so2Value: number | null;
  coValue: number | null;
  /** N53: 초단기실황 기온(°C)·습도(%). 등급 없이 원값만 노출한다. */
  temperature: number | null;
  humidity: number | null;
};

/**
 * Prisma가 만든 행의 지표 부분.
 *
 * Prisma는 enum을 문자열 리터럴 유니온으로, 앱은 TS `enum`으로 표현한다. 값은 같지만
 * 타입은 서로 대입되지 않아 호출부마다 `as AirStatus` 캐스트가 흩어져 있었다.
 * 변환을 이 파일 안으로 모아 캐스트가 한 곳에만 남게 한다.
 */
export type PrismaWeatherMetrics = Pick<PrismaWeatherSnapshot, WeatherMetricKey>;

/** 매퍼가 읽는 스냅샷의 최소 형태 — Prisma `WeatherSnapshot`이 그대로 만족한다. */
export interface WeatherSnapshotLike extends PrismaWeatherMetrics {
  observedAt: Date;
  regionName: string;
  districtName?: string | null;
  source: PrismaWeatherSnapshot['source'];
}

/** 외부 API 수집 결과(지표 원본값). `WeatherStatusPolicy`로 등급을 계산한다. */
export interface CollectedMetrics {
  uv: { current: number | null; peak: number | null; peakHour: number | null };
  air: {
    ozone: number | null;
    pm25: number | null;
    pm10: number | null;
    cai: number | null;
    no2: number | null;
    so2: number | null;
    co: number | null;
  };
  /** N53: 초단기실황(기온·습도). */
  nowcast: { temperature: number | null; humidity: number | null };
}

/** 수집 원본 → 지표 묶음. 등급 계산 규칙이 여기 한 곳에만 있다. */
export function metricsFromCollected(
  c: CollectedMetrics,
  policy: WeatherStatusPolicy,
): WeatherMetrics {
  return {
    uvIndex: c.uv.current,
    uvStatus: policy.uvStatus(c.uv.current),
    uvIndexPeak: c.uv.peak,
    uvStatusPeak: policy.uvStatus(c.uv.peak),
    uvIndexPeakHour: c.uv.peakHour,
    ozonePpm: c.air.ozone,
    ozoneStatus: policy.ozoneStatus(c.air.ozone),
    pm25: c.air.pm25,
    pm25Status: policy.pm25Status(c.air.pm25),
    pm10: c.air.pm10,
    pm10Status: policy.pm10Status(c.air.pm10),
    caiValue: c.air.cai,
    caiStatus: policy.caiStatus(c.air.cai),
    no2Value: c.air.no2,
    so2Value: c.air.so2,
    coValue: c.air.co,
    // N53: 기온·습도는 공식 등급 체계가 없어 원값만 저장한다.
    temperature: c.nowcast.temperature,
    humidity: c.nowcast.humidity,
  };
}

/** 저장된 스냅샷에서 지표만 뽑는다. 키 배열을 돌기 때문에 누락이 불가능하다. */
export function metricsFromSnapshot(s: PrismaWeatherMetrics): WeatherMetrics {
  const out = {} as Record<WeatherMetricKey, unknown>;
  for (const key of WEATHER_METRIC_KEYS) out[key] = s[key];
  // 등급 값(good/moderate/bad)이 두 enum에서 동일하므로 안전하다.
  return out as WeatherMetrics;
}

/** 지표를 DTO(또는 임의 객체)에 복사한다. */
export function assignWeatherMetrics<T extends Partial<WeatherMetrics>>(
  target: T,
  metrics: WeatherMetrics,
): T {
  return Object.assign(target, metrics);
}

/**
 * 저장된 스냅샷 → 응답 DTO.
 *
 * `source`를 넘기면 그 값으로 표기한다. 캐시된 행을 응답할 때 원본이 LIVE였더라도
 * "라이브가 아님"을 알려야 하기 때문이다(`product.service`).
 */
export function toWeatherSnapshotDto(
  s: WeatherSnapshotLike,
  source: WeatherSource = s.source as WeatherSource,
): WeatherSnapshotDto {
  const dto = new WeatherSnapshotDto();
  dto.observedAt = s.observedAt.toISOString();
  dto.regionName = s.regionName;
  dto.districtName = s.districtName ?? null;
  dto.source = source;
  return assignWeatherMetrics(dto, metricsFromSnapshot(s));
}
