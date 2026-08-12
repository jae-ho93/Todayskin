import { Prisma, WeatherSnapshot } from '@prisma/client';
import { AirStatus } from '../../../common/enums/air-status.enum';
import { UvLevel } from '../../../common/enums/uv-level.enum';
import { WeatherSource } from '../../../common/enums/weather-source.enum';
import { WeatherStatusPolicy } from '../policies/weather-status.policy';
import {
  WEATHER_METRIC_KEYS,
  metricsFromCollected,
  metricsFromSnapshot,
  toWeatherSnapshotDto,
} from './weather-snapshot.mapper';

/** 지표가 아닌(위치·시각·출처·관계) 컬럼. 새 메타 컬럼을 추가하면 여기에 넣는다. */
const NON_METRIC_FIELDS = new Set([
  'id',
  'observedAt',
  'collectedAt',
  'regionName',
  'cityName',
  'districtName',
  'latitude',
  'longitude',
  'kmaAreaNo',
  'airkoreaStation',
  'source',
  'diagnoses',
  // N42: 지표가 아니라 "그 지표를 왜 못 받았는가"를 말하는 메타 컬럼.
  'uvCollectionFailed',
  'airCollectionFailed',
]);

const snapshotRow = (over: Partial<WeatherSnapshot> = {}): WeatherSnapshot =>
  ({
    id: 'snap-1',
    observedAt: new Date('2026-08-04T06:00:00Z'),
    collectedAt: new Date('2026-08-04T06:05:00Z'),
    regionName: '서울특별시',
    cityName: '서울특별시',
    districtName: '종로구',
    latitude: 37.57,
    longitude: 126.98,
    kmaAreaNo: '1111000000',
    airkoreaStation: '종로구',
    uvIndex: 7,
    uvStatus: 'high',
    uvIndexPeak: 9,
    uvStatusPeak: 'veryHigh',
    uvIndexPeakHour: 13,
    ozonePpm: 0.05,
    ozoneStatus: 'moderate',
    pm25: 20,
    pm25Status: 'moderate',
    pm10: 45,
    pm10Status: 'moderate',
    caiValue: 60,
    caiStatus: 'moderate',
    no2Value: 0.02,
    so2Value: 0.005,
    coValue: 0.4,
    source: 'LIVE',
    ...over,
  }) as WeatherSnapshot;

describe('weather-snapshot.mapper (R22)', () => {
  it('WEATHER_METRIC_KEYS가 Prisma 모델의 지표 컬럼 전체를 덮는다', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'WeatherSnapshot');
    const modelMetrics = (model?.fields ?? [])
      .map((f) => f.name)
      .filter((name) => !NON_METRIC_FIELDS.has(name));

    // 스키마에 지표를 추가하고 매퍼에 넣지 않으면 여기서 실패한다 — 그래야 어느
    // 변환 경로에서 필드가 조용히 빠지는 일(product.service의 districtName 누락)이
    // 반복되지 않는다.
    expect([...WEATHER_METRIC_KEYS].sort()).toEqual(modelMetrics.sort());
  });

  it('metricsFromSnapshot은 지표만 복사하고 메타 컬럼은 남기지 않는다', () => {
    const metrics = metricsFromSnapshot(snapshotRow());

    expect(Object.keys(metrics).sort()).toEqual([...WEATHER_METRIC_KEYS].sort());
    expect(metrics.uvIndex).toBe(7);
    expect(metrics.uvStatusPeak).toBe(UvLevel.VERY_HIGH);
    expect(metrics.coValue).toBe(0.4);
  });

  it('toWeatherSnapshotDto는 districtName을 포함하고 source를 덮어쓸 수 있다', () => {
    const dto = toWeatherSnapshotDto(snapshotRow(), WeatherSource.CACHED);

    // 이전에는 product.service 사본이 districtName을 빠뜨려 같은 스냅샷이
    // 캘린더 응답과 제품 응답에서 다르게 보였다.
    expect(dto.districtName).toBe('종로구');
    expect(dto.source).toBe(WeatherSource.CACHED);
    expect(dto.observedAt).toBe('2026-08-04T06:00:00.000Z');
    expect(dto.pm25).toBe(20);
    expect(dto.caiStatus).toBe(AirStatus.MODERATE);
  });

  it('districtName이 없으면 undefined 대신 null로 내린다', () => {
    const dto = toWeatherSnapshotDto(snapshotRow({ districtName: null }));

    expect(dto.districtName).toBeNull();
    expect(dto.source).toBe(WeatherSource.LIVE);
  });

  it('metricsFromCollected는 등급을 정책으로 계산한다', () => {
    const metrics = metricsFromCollected(
      {
        uv: { current: 8, peak: 9, peakHour: 13 },
        air: { ozone: 0.05, pm25: 20, pm10: 45, cai: 60, no2: 0.02, so2: 0.005, co: 0.4 },
      },
      new WeatherStatusPolicy(),
    );

    // 자외선 8 = 8 이상 10 이하 → 매우높음
    expect(metrics.uvStatus).toBe(UvLevel.VERY_HIGH);
    // PM2.5 20 = 15 초과 35 이하 → 보통
    expect(metrics.pm25Status).toBe(AirStatus.MODERATE);
    expect(metrics.pm10Status).toBe(AirStatus.MODERATE);
    expect(Object.keys(metrics).sort()).toEqual([...WEATHER_METRIC_KEYS].sort());
  });

  it('측정값이 없으면 등급도 null이다 (목업으로 채우지 않는다)', () => {
    const metrics = metricsFromCollected(
      {
        uv: { current: null, peak: null, peakHour: null },
        air: { ozone: null, pm25: null, pm10: null, cai: null, no2: null, so2: null, co: null },
      },
      new WeatherStatusPolicy(),
    );

    for (const key of WEATHER_METRIC_KEYS) {
      expect(metrics[key]).toBeNull();
    }
  });
});
