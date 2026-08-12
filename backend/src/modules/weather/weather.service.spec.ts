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
import { UvLevel } from '../../common/enums/uv-level.enum';

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
    $executeRaw: jest.Mock;
  };

  const uv = (over: Partial<UvForecastWithTime> = {}): UvForecastWithTime => ({
    current: null,
    peak: null,
    peakHour: null,
    observedAt: null,
    failed: false,
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
    failed: false,
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
      $executeRaw: jest.fn().mockResolvedValue(1),
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
      districtName: '중구',
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

    expect(stationClient.fetchNearestStation).toHaveBeenCalledWith(37.5665, 126.978, 0);
    expect(kmaClient.fetchUvIndex).toHaveBeenCalled();
    expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith('중구', 0);
    // F56: 시/도는 근사표 정식 명칭, 구/군은 측정소 주소 토큰에서
    expect(result.regionName).toBe('서울특별시');
    expect(result.districtName).toBe('중구');
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

  // N40: 자외선은 기상청 5단계(낮음·보통·높음·매우높음·위험)를 쓴다.
  it('UV 등급 정책: 기상청 5단계로 판정한다', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 7 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air());
    const result = await service.getCurrentWeather();
    expect(result.uvStatus).toBe(UvLevel.HIGH);

    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 9 }));
    const result2 = await service.getCurrentWeather();
    expect(result2.uvStatus).toBe(UvLevel.VERY_HIGH);

    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 4 }));
    const result3 = await service.getCurrentWeather();
    expect(result3.uvStatus).toBe(UvLevel.MODERATE);

    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 2 }));
    const result4 = await service.getCurrentWeather();
    expect(result4.uvStatus).toBe(UvLevel.LOW);
  });

  it('PM2.5 등급 정책: 35 초과 bad, 15 초과 moderate, 이하 good', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv());
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 40 }));
    const result = await service.getCurrentWeather();
    expect(result.pm25Status).toBe(AirStatus.BAD);
    expect(result.source).toBe(WeatherSource.LIVE);
  });

  it('근접측정소 조회 실패 시 대기질은 근사표 측정소로 폴백한다', async () => {
    stationClient.fetchNearestStation.mockResolvedValue(null);
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air());

    // 서울 강남구 좌표 → 근사표의 강남구
    const result = await service.getCurrentWeather(37.5172, 127.0473);
    expect(result.regionName).toBe('서울특별시');
    // 폴백 시 강남구 측정소명 사용
    expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith('강남구', 0);
  });

  /**
   * N41: 해운대구에서 찍은 기록이 "부산 중구"로 표시됐다.
   *
   * 측정소 조회가 실패하면 근사표의 `airkoreaStationName`을 구 이름으로 썼는데,
   * 그건 측정소명이지 행정구역이 아니다(부산 대표 측정소가 '중구'다). 사용자는
   * 추측과 사실을 구별할 수 없으므로 모르면 비운다.
   */
  it('N41: 측정소 조회가 실패해도 근사표 측정소명을 구 이름으로 쓰지 않는다', async () => {
    stationClient.fetchNearestStation.mockResolvedValue(null);
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air());

    // 해운대 좌표 → 근사표는 '부산광역시'(대표 측정소명 '중구')로 붙는다
    const result = await service.getCurrentWeather(35.16526, 129.1635);

    expect(result.regionName).toBe('부산광역시');
    expect(result.districtName).toBeNull();
    expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith('중구', 0);
  });

  it('N41: 측정소 조회가 성공하면 그 구 이름을 쓴다', async () => {
    stationClient.fetchNearestStation.mockResolvedValue({
      stationName: '좌동',
      districtName: '해운대구',
      cityName: '부산',
    });
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air());

    const result = await service.getCurrentWeather(35.16526, 129.1635);

    expect(result.districtName).toBe('해운대구');
    expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith('좌동', 0);
  });

  /**
   * 캐시 키가 좌표를 소수 2자리로 뭉치므로, 폴백으로 만든 결과가 기본 TTL(5분)로
   * 들어가면 그 일대 사용자 전원이 5분 내내 같은 오답을 본다. 실기기에서 10회 연속
   * 같은 오답이 나온 원인이 이것이다.
   */
  it('N41: 측정소 조회 실패 결과는 짧은 TTL로만 캐시한다', async () => {
    stationClient.fetchNearestStation.mockResolvedValue(null);
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air());
    redisService.isAvailable.mockReturnValue(true);

    await service.getCurrentWeather(35.16526, 129.1635);

    expect(redisService.setJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      30,
    );
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
    expect(arg.data.uvStatus).toBe(UvLevel.HIGH);
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
    expect(arg.data.uvStatusPeak).toBe(UvLevel.VERY_HIGH); // peak=9 → 매우높음
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

  it('N25: meta(근사표) 제공 시 근접측정소 조회를 생략하고 UV+대기질을 병렬 수집한다', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 6 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 15 }));
    prisma.weatherSnapshot.findFirst.mockResolvedValue(null);
    prisma.weatherSnapshot.create.mockResolvedValue({ id: 'snap-meta' });

    const result = await service.getOrCreateSnapshot(37.5, 127.0, {
      areaNo: '1111000000',
      stationName: '종로구',
      regionName: '서울특별시',
      cityName: '서울특별시',
      districtName: '종로구',
    });

    expect(result?.id).toBe('snap-meta');
    // 스케줄러 워밍 경로: 측정소 조회 없이 UV+대기질만 호출한다.
    expect(stationClient.fetchNearestStation).not.toHaveBeenCalled();
    expect(kmaClient.fetchUvIndex).toHaveBeenCalledWith('1111000000', 1);
    expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith('종로구', 1);
    // 저장 row의 지역/측정소 메타는 전달받은 근사표 값을 사용한다.
    const arg = prisma.weatherSnapshot.create.mock.calls[0][0];
    expect(arg.data.regionName).toBe('서울특별시');
    expect(arg.data.airkoreaStation).toBe('종로구');
    expect(arg.data.kmaAreaNo).toBe('1111000000');
    // N41: 스케줄러 경로 스냅샷의 구 이름이 전부 null이던 문제.
    expect(arg.data.districtName).toBe('종로구');
  });

  /**
   * N42: 진단 스냅샷의 대기질이 전부 null로 남았다. 이 경로는 캐시를 쓰지 않고
   * 결과를 영구 저장하므로, 일시 실패 한 번이 그 기록에 영원히 남는다.
   */
  describe('N42: 진단 경로의 수집 실패 처리', () => {
    // 재시도 자체는 클라이언트 안에서 일어난다(retry.util.spec.ts가 검증).
    // 여기서는 "어느 경로가 재시도를 켜는가"라는 정책만 고정한다.
    it('진단 경로는 세 외부 호출 모두 재시도를 켠다', async () => {
      kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
      airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 5 }));
      prisma.weatherSnapshot.findFirst.mockResolvedValue(null);
      prisma.weatherSnapshot.create.mockResolvedValue({ id: 'snap-retry' });

      await service.getOrCreateSnapshot(37.5, 127.0);

      expect(stationClient.fetchNearestStation).toHaveBeenCalledWith(37.5, 127.0, 1);
      expect(kmaClient.fetchUvIndex).toHaveBeenCalledWith(expect.any(String), 1);
      expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith(
        expect.any(String),
        1,
      );
    });

    it('응답 경로는 재시도하지 않는다 — 외부 API가 느릴 때 모두의 지연이 늘어난다', async () => {
      kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
      airKoreaClient.fetchAirQuality.mockResolvedValue(air({ failed: true }));

      await service.getCurrentWeather(37.5, 127.0);

      expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith(
        expect.any(String),
        0,
      );
    });

    it('재시도해도 실패하면 부분 저장하되 실패 사실을 남긴다', async () => {
      kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
      airKoreaClient.fetchAirQuality.mockResolvedValue(air({ failed: true }));
      prisma.weatherSnapshot.findFirst.mockResolvedValue(null);
      prisma.weatherSnapshot.create.mockResolvedValue({ id: 'snap-partial' });

      await service.getOrCreateSnapshot(37.5, 127.0);

      const arg = prisma.weatherSnapshot.create.mock.calls[0][0];
      // 자외선과 관측 시각은 실제 값이므로 통째로 버리지 않는다.
      expect(arg.data.uvIndex).toBe(3);
      expect(arg.data.pm25).toBeNull();
      // 화면이 "값 없음"과 구별할 수 있도록 실패를 남긴다 (F70).
      expect(arg.data.airCollectionFailed).toBe(true);
      expect(arg.data.uvCollectionFailed).toBe(false);
    });

    it('값 없음(failed=false)은 수집 실패로 기록하지 않는다', async () => {
      kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
      airKoreaClient.fetchAirQuality.mockResolvedValue(air({ failed: false }));
      prisma.weatherSnapshot.findFirst.mockResolvedValue(null);
      prisma.weatherSnapshot.create.mockResolvedValue({ id: 'snap-empty' });

      await service.getOrCreateSnapshot(37.5, 127.0);

      const arg = prisma.weatherSnapshot.create.mock.calls[0][0];
      expect(arg.data.airCollectionFailed).toBe(false);
    });

    it('수집 실패율을 지표로 남긴다', async () => {
      kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 3 }));
      airKoreaClient.fetchAirQuality.mockResolvedValue(air({ failed: true }));
      prisma.weatherSnapshot.findFirst.mockResolvedValue(null);
      prisma.weatherSnapshot.create.mockResolvedValue({ id: 'snap-metric' });

      await service.getOrCreateSnapshot(37.5, 127.0);

      expect(redisService.incrementCounter).toHaveBeenCalledWith(
        'metric:weather:collect:total',
      );
      expect(redisService.incrementCounter).toHaveBeenCalledWith(
        'metric:weather:collect:air_failed',
      );
    });
  });

  it('N25: 기본 지역(좌표 없음)은 UV와 대기질을 병렬로 모두 호출한다', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue(uv({ current: 5 }));
    airKoreaClient.fetchAirQuality.mockResolvedValue(air({ pm25: 12 }));
    prisma.weatherSnapshot.findFirst.mockResolvedValue(null);
    prisma.weatherSnapshot.create.mockResolvedValue({ id: 'snap-default' });

    const result = await service.getCurrentWeather();

    expect(result.source).toBe(WeatherSource.LIVE);
    expect(kmaClient.fetchUvIndex).toHaveBeenCalledTimes(1);
    expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledTimes(1);
    // 기본 지역은 근접측정소 조회가 필요 없다.
    expect(stationClient.fetchNearestStation).not.toHaveBeenCalled();
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
