import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WeatherService } from './weather.service';
import { KmaClient, UvForecastWithTime } from './clients/kma.client';
import {
  AirKoreaClient,
  AirQualityDataWithTime,
} from './clients/airkorea.client';
import { StationClient } from './clients/station.client';
import { PrismaService } from '../../prisma/prisma.service';
import { WeatherSource } from '../../common/enums/weather-source.enum';
import { AirStatus } from '../../common/enums/air-status.enum';

describe('WeatherService', () => {
  let service: WeatherService;
  let kmaClient: jest.Mocked<KmaClient>;
  let airKoreaClient: jest.Mocked<AirKoreaClient>;
  let stationClient: jest.Mocked<StationClient>;
  let prisma: {
    weatherSnapshot: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  const uv = (over: Partial<UvForecastWithTime> = {}): UvForecastWithTime => ({
    current: null,
    peak: null,
    peakHour: null,
    observedAt: null,
    ...over,
  });

  const air = (over: Partial<AirQualityDataWithTime> = {}): AirQualityDataWithTime => ({
    ozone: null,
    pm25: null,
    pm10: null,
    cai: null,
    no2: null,
    so2: null,
    co: null,
    observedAt: null,
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      weatherSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'snap-1' }),
        findUnique: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WeatherService,
        { provide: KmaClient, useValue: { fetchUvIndex: jest.fn() } },
        { provide: AirKoreaClient, useValue: { fetchAirQuality: jest.fn() } },
        { provide: StationClient, useValue: { fetchNearestStation: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: string) =>
              key === 'KMA_AREA_NO' ? '1111000000' : def ?? '',
          },
        },
      ],
    }).compile();

    service = moduleRef.get(WeatherService);
    kmaClient = moduleRef.get(KmaClient);
    airKoreaClient = moduleRef.get(AirKoreaClient);
    stationClient = moduleRef.get(StationClient);
  });

  it('API 키 없음 시 모든 지표 null + source UNAVAILABLE (목업 대체 안 함)', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv());
    airKoreaClient.fetchAirQuality.mockResolvedValue(air());

    const result = await service.getCurrentWeather();

    expect(result.source).toBe(WeatherSource.UNAVAILABLE);
    expect(result.uvIndex).toBeNull();
    expect(result.uvStatus).toBeNull();
    expect(result.pm25).toBeNull();
    expect(result.caiValue).toBeNull();
    // UNAVAILABLE은 저장하지 않는다
    expect(prisma.weatherSnapshot.create).not.toHaveBeenCalled();
  });

  it('좌표 있을 때 근접측정소 + UV 병렬 조회 후 대기질 조회', async () => {
    stationClient.fetchNearestStation.mockResolvedValue({
      stationName: '중구',
      cityName: '서울',
    });
    kmaClient.fetchUvIndex.mockResolvedValue(
      uv({ current: 7, peak: 8, peakHour: 13, observedAt: new Date('2026-08-04T06:00:00Z') }),
    );
    airKoreaClient.fetchAirQuality.mockResolvedValue(
      air({
        ozone: 0.05,
        pm25: 20,
        pm10: 45,
        cai: 60,
        no2: 0.02,
        so2: 0.005,
        co: 0.4,
        observedAt: new Date('2026-08-04T06:30:00Z'),
      }),
    );

    const result = await service.getCurrentWeather(37.5665, 126.978);

    expect(stationClient.fetchNearestStation).toHaveBeenCalledWith(37.5665, 126.978);
    expect(kmaClient.fetchUvIndex).toHaveBeenCalled();
    expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith('중구');
    expect(result.regionName).toBe('서울');
    expect(result.source).toBe(WeatherSource.LIVE);
    // LIVE snapshot은 저장된다
    expect(prisma.weatherSnapshot.create).toHaveBeenCalledTimes(1);
  });

  it('관측 시각은 UV/대기 중 더 최근 시각을 사용한다', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(
      uv({ current: 3, observedAt: new Date('2026-08-04T06:00:00Z') }),
    );
    airKoreaClient.fetchAirQuality.mockResolvedValue(
      air({ pm25: 10, observedAt: new Date('2026-08-04T06:30:00Z') }),
    );

    const result = await service.getCurrentWeather();
    expect(result.observedAt).toBe('2026-08-04T06:30:00.000Z');
  });

  it('UV 등급 정책: 6 이상 bad, 3 이상 moderate, 미만 good', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 7 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air());
    const result = await service.getCurrentWeather();
    expect(result.uvStatus).toBe(AirStatus.BAD);

    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 4 }));
    const result2 = await service.getCurrentWeather();
    expect(result2.uvStatus).toBe(AirStatus.MODERATE);

    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 2 }));
    const result3 = await service.getCurrentWeather();
    expect(result3.uvStatus).toBe(AirStatus.GOOD);
  });

  it('PM2.5 등급 정책: 35 초과 bad, 15 초과 moderate, 이하 good', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv());
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 40 }));
    const result = await service.getCurrentWeather();
    expect(result.pm25Status).toBe(AirStatus.BAD);
    expect(result.source).toBe(WeatherSource.LIVE);
  });

  it('근접측정소 조회 실패 시 REGIONS 근사표로 폴백', async () => {
    stationClient.fetchNearestStation.mockResolvedValue(null);
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air());

    // 서울 강남구 좌표 → 근사표의 강남구
    const result = await service.getCurrentWeather(37.5172, 127.0473);
    expect(result.regionName).toBe('서울특별시');
    // 폴백 시 강남구 측정소명 사용
    expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith('강남구');
  });

  it('동일 관측 시각 snapshot이 있으면 재사용(create 미호출)', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(
      uv({ current: 5, observedAt: new Date('2026-08-04T06:00:00Z') }),
    );
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 12 }));
    prisma.weatherSnapshot.findFirst.mockResolvedValue({ id: 'existing-snap' });

    await service.getCurrentWeather();
    expect(prisma.weatherSnapshot.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.weatherSnapshot.create).not.toHaveBeenCalled();
  });

  it('저장 실패해도 응답은 정상 반환한다', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 5 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 12 }));
    prisma.weatherSnapshot.findFirst.mockRejectedValue(new Error('db down'));

    const result = await service.getCurrentWeather();
    expect(result.source).toBe(WeatherSource.LIVE);
  });

  it('getSnapshotById는 DB에서 조회한다', async () => {
    prisma.weatherSnapshot.findUnique.mockResolvedValue({ id: 'snap-1' });
    const result = await service.getSnapshotById('snap-1');
    expect(prisma.weatherSnapshot.findUnique).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
    });
    expect(result?.id).toBe('snap-1');
  });
});
