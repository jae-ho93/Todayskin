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
import { RedisService } from '../../redis/redis.service';
import { WeatherSource } from '../../common/enums/weather-source.enum';
import { AirStatus } from '../../common/enums/air-status.enum';

describe('WeatherService', () => {
  let service: WeatherService;
  let kmaClient: jest.Mocked<KmaClient>;
  let airKoreaClient: jest.Mocked<AirKoreaClient>;
  let stationClient: jest.Mocked<StationClient>;
  let redisService: {
    isAvailable: jest.Mock;
    getJson: jest.Mock;
    setJson: jest.Mock;
    incrementCounter: jest.Mock;
  };
  let prisma: {
    weatherSnapshot: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
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
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) =>
        callback({ ...prisma, $executeRaw: jest.fn().mockResolvedValue(1) }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        WeatherService,
        { provide: KmaClient, useValue: { fetchUvIndex: jest.fn() } },
        { provide: AirKoreaClient, useValue: { fetchAirQuality: jest.fn() } },
        { provide: StationClient, useValue: { fetchNearestStation: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        {
          provide: RedisService,
          useValue: {
            // 기본: 캐시 비활성화 — 기존 테스트는 외부 API 호출 경로를 검증
            isAvailable: jest.fn().mockReturnValue(false),
            getJson: jest.fn().mockResolvedValue(null),
            setJson: jest.fn().mockResolvedValue(true),
            incrementCounter: jest.fn().mockResolvedValue(null),
          },
        },
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
    redisService = moduleRef.get(RedisService);
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

  it('저장 row의 모든 필드가 수집 데이터와 정확히 매핑된다', async () => {
    const uvAt = new Date('2026-08-04T06:00:00Z');
    const airAt = new Date('2026-08-04T06:30:00Z');
    kmaClient.fetchUvIndex.mockResolvedValue(
      uv({ current: 7, peak: 9, peakHour: 13, observedAt: uvAt }),
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
        observedAt: airAt,
      }),
    );
    prisma.weatherSnapshot.findFirst.mockResolvedValue(null);
    prisma.weatherSnapshot.create.mockResolvedValue({ id: 'snap-1' });

    await service.getCurrentWeather(37.5665, 126.978);

    expect(prisma.weatherSnapshot.create).toHaveBeenCalledTimes(1);
    const arg = prisma.weatherSnapshot.create.mock.calls[0][0];
    // 관측 시각은 더 최근(air) 사용
   expect(arg.data.observedAt).toEqual(airAt);
   // 좌표(37.5665, 126.978) → 근사표 서울 중구 → regionName "서울특별시"
   expect(arg.data.regionName).toBe('서울특별시');
    expect(arg.data.latitude).toBe(37.5665);
    expect(arg.data.longitude).toBe(126.978);
    expect(arg.data.uvIndex).toBe(7);
    expect(arg.data.uvStatus).toBe(AirStatus.BAD);
    expect(arg.data.uvIndexPeak).toBe(9);
    expect(arg.data.uvIndexPeakHour).toBe(13);
    expect(arg.data.ozonePpm).toBe(0.05);
    expect(arg.data.ozoneStatus).toBe(AirStatus.MODERATE);
    expect(arg.data.pm25).toBe(20);
    expect(arg.data.pm25Status).toBe(AirStatus.MODERATE);
    expect(arg.data.pm10).toBe(45);
    expect(arg.data.caiValue).toBe(60);
    expect(arg.data.caiStatus).toBe(AirStatus.MODERATE);
    expect(arg.data.no2Value).toBe(0.02);
    expect(arg.data.so2Value).toBe(0.005);
    expect(arg.data.coValue).toBe(0.4);
   expect(arg.data.source).toBe(WeatherSource.LIVE);
    expect(arg.data.uvStatusPeak).toBe(AirStatus.BAD); // peak=9 → bad
  });

  it('좌표 없을 때 저장 row에 lat/lon은 null이다', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 10 }));
    prisma.weatherSnapshot.findFirst.mockResolvedValue(null);

    await service.getCurrentWeather();
    const arg = prisma.weatherSnapshot.create.mock.calls[0][0];
    expect(arg.data.latitude).toBeNull();
    expect(arg.data.longitude).toBeNull();
    // 기본 지역 areaNo/station 저장
    expect(arg.data.kmaAreaNo).toBe('1111000000');
  });

  it('getOrCreateSnapshot은 수집+저장 후 row를 반환한다', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 5 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 12 }));
    prisma.weatherSnapshot.findFirst.mockResolvedValue(null);
    prisma.weatherSnapshot.create.mockResolvedValue({ id: 'snap-42' });

    const result = await service.getOrCreateSnapshot(37.5, 127.0);
    expect(result?.id).toBe('snap-42');
    expect(prisma.weatherSnapshot.create).toHaveBeenCalledTimes(1);
  });

  it('getOrCreateSnapshot은 UNAVAILABLE이면 null을 반환한다', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv());
    airKoreaClient.fetchAirQuality.mockResolvedValue(air());

    const result = await service.getOrCreateSnapshot();
    expect(result).toBeNull();
    expect(prisma.weatherSnapshot.create).not.toHaveBeenCalled();
  });

  it('getOrCreateSnapshot은 dedup hit 시 기존 row를 반환한다', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 5 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 12 }));
    prisma.weatherSnapshot.findFirst.mockResolvedValue({ id: 'existing' });

    const result = await service.getOrCreateSnapshot();
    expect(result?.id).toBe('existing');
    expect(prisma.weatherSnapshot.create).not.toHaveBeenCalled();
  });

  // ── T12 Redis 날씨 캐시 ──────────────────────────────

  it('캐시 hit 시 외부 API를 호출하지 않고 source=CACHED로 반환한다', async () => {
    redisService.isAvailable.mockReturnValue(true);
    redisService.getJson.mockResolvedValue({
      dto: {
        observedAt: '2026-08-04T06:30:00.000Z',
        regionName: '서울특별시',
        source: WeatherSource.LIVE,
        uvIndex: 7,
        pm25: 20,
      },
      cachedAt: '2026-08-04T06:35:00.000Z',
    });

    const result = await service.getCurrentWeather(37.5665, 126.978);

    expect(result.source).toBe(WeatherSource.CACHED);
    expect(result.uvIndex).toBe(7);
    expect(kmaClient.fetchUvIndex).not.toHaveBeenCalled();
    expect(airKoreaClient.fetchAirQuality).not.toHaveBeenCalled();
    expect(prisma.weatherSnapshot.create).not.toHaveBeenCalled();
    // N11: cache hit 지표 기록
    expect(redisService.incrementCounter).toHaveBeenCalledWith(
      'metric:weather:cache:hit',
    );
  });

  it('캐시 miss 시 외부 API 호출 후 결과를 캐시에 저장한다', async () => {
    redisService.isAvailable.mockReturnValue(true);
    redisService.getJson.mockResolvedValue(null);
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 5 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 12 }));
    prisma.weatherSnapshot.findFirst.mockResolvedValue(null);

    const result = await service.getCurrentWeather();

    expect(result.source).toBe(WeatherSource.LIVE);
    expect(redisService.setJson).toHaveBeenCalledTimes(1);
    // 캐시 키가 weather:current: 형식
    const [key] = redisService.setJson.mock.calls[0];
    expect(key).toMatch(/^weather:current:/);
    // N11: cache miss 지표 기록
    expect(redisService.incrementCounter).toHaveBeenCalledWith(
      'metric:weather:cache:miss',
    );
  });

  it('Redis 장애 시 외부 API fallback으로 정상 응답한다', async () => {
    // 실제 RedisService는 장애 시 예외를 잡아 null/false 반환하도록 설계되어 있다.
    // 여기서는 isAvailable()=false(연결 끊김) 상황을 시뮬레이션해 fallback을 검증한다.
    redisService.isAvailable.mockReturnValue(false);
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 5 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 12 }));
    prisma.weatherSnapshot.findFirst.mockResolvedValue(null);

    const result = await service.getCurrentWeather();

    expect(result.source).toBe(WeatherSource.LIVE);
    expect(kmaClient.fetchUvIndex).toHaveBeenCalled();
  });

  it('Redis 비활성화(REDIS_URL 없음) 시 외부 API 직접 호출', async () => {
    redisService.isAvailable.mockReturnValue(false);
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 5 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 12 }));
    prisma.weatherSnapshot.findFirst.mockResolvedValue(null);

    const result = await service.getCurrentWeather();

    expect(result.source).toBe(WeatherSource.LIVE);
    expect(redisService.getJson).not.toHaveBeenCalled();
    expect(redisService.setJson).not.toHaveBeenCalled();
  });

  it('getOrCreateSnapshot은 캐시를 사용하지 않고 항상 외부 API를 호출한다', async () => {
    redisService.isAvailable.mockReturnValue(true);
    redisService.getJson.mockResolvedValue({
      dto: { source: WeatherSource.CACHED, uvIndex: 99 },
      cachedAt: '2026-08-04T06:35:00.000Z',
    });
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 5 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 12 }));
    prisma.weatherSnapshot.findFirst.mockResolvedValue(null);
    prisma.weatherSnapshot.create.mockResolvedValue({ id: 'snap-99' });

    const result = await service.getOrCreateSnapshot();

    expect(result?.id).toBe('snap-99');
    // 캐시가 존재해도 진단용은 외부 API를 호출한다
    expect(kmaClient.fetchUvIndex).toHaveBeenCalled();
    expect(redisService.getJson).not.toHaveBeenCalled();
  });
});
