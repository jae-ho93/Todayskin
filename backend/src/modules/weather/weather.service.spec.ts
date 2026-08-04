
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WeatherService } from './weather.service';
import { KmaClient } from './clients/kma.client';
import { AirKoreaClient } from './clients/airkorea.client';
import { StationClient } from './clients/station.client';
import { WeatherSource } from '../../common/enums/weather-source.enum';
import { AirStatus } from '../../common/enums/air-status.enum';

describe('WeatherService', () => {
  let service: WeatherService;
  let kmaClient: jest.Mocked<KmaClient>;
  let airKoreaClient: jest.Mocked<AirKoreaClient>;
  let stationClient: jest.Mocked<StationClient>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WeatherService,
        {
          provide: KmaClient,
          useValue: { fetchUvIndex: jest.fn() },
        },
        {
          provide: AirKoreaClient,
          useValue: { fetchAirQuality: jest.fn() },
        },
        {
          provide: StationClient,
          useValue: { fetchNearestStation: jest.fn() },
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
  });

  it('API 키 없음 시 모든 지표 null + source UNAVAILABLE (목업 대체 안 함)', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue({
      current: null,
      peak: null,
      peakHour: null,
    });
    airKoreaClient.fetchAirQuality.mockResolvedValue({
      ozone: null,
      pm25: null,
      pm10: null,
      cai: null,
      no2: null,
      so2: null,
      co: null,
    });

    const result = await service.getCurrentWeather();

    expect(result.source).toBe(WeatherSource.UNAVAILABLE);
    expect(result.uvIndex).toBeNull();
    expect(result.uvStatus).toBeNull();
    expect(result.pm25).toBeNull();
    expect(result.caiValue).toBeNull();
  });

  it('좌표 있을 때 근접측정소 + UV 병렬 조회 후 대기질 조회', async () => {
    stationClient.fetchNearestStation.mockResolvedValue({
      stationName: '중구',
      cityName: '서울',
    });
    kmaClient.fetchUvIndex.mockResolvedValue({
      current: 7,
      peak: 8,
      peakHour: 13,
    });
    airKoreaClient.fetchAirQuality.mockResolvedValue({
      ozone: 0.05,
      pm25: 20,
      pm10: 45,
      cai: 60,
      no2: 0.02,
      so2: 0.005,
      co: 0.4,
    });

    const result = await service.getCurrentWeather(37.5665, 126.978);

    expect(stationClient.fetchNearestStation).toHaveBeenCalledWith(37.5665, 126.978);
    expect(kmaClient.fetchUvIndex).toHaveBeenCalled();
    expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith('중구');
    expect(result.regionName).toBe('서울');
    expect(result.source).toBe(WeatherSource.LIVE);
  });

  it('UV 등급 정책: 6 이상 bad, 3 이상 moderate, 미만 good', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue({
      current: 7,
      peak: null,
      peakHour: null,
    });
    airKoreaClient.fetchAirQuality.mockResolvedValue({
      ozone: null,
      pm25: null,
      pm10: null,
      cai: null,
      no2: null,
      so2: null,
      co: null,
    });

    const result = await service.getCurrentWeather();
    expect(result.uvStatus).toBe(AirStatus.BAD);

    kmaClient.fetchUvIndex.mockResolvedValue({
      current: 4,
      peak: null,
      peakHour: null,
    });
    const result2 = await service.getCurrentWeather();
    expect(result2.uvStatus).toBe(AirStatus.MODERATE);

    kmaClient.fetchUvIndex.mockResolvedValue({
      current: 2,
      peak: null,
      peakHour: null,
    });
    const result3 = await service.getCurrentWeather();
    expect(result3.uvStatus).toBe(AirStatus.GOOD);
  });

  it('PM2.5 등급 정책: 35 초과 bad, 15 초과 moderate, 이하 good', async () => {
    kmaClient.fetchUvIndex.mockResolvedValue({
      current: null,
      peak: null,
      peakHour: null,
    });
    airKoreaClient.fetchAirQuality.mockResolvedValue({
      ozone: null,
      pm25: 40,
      pm10: null,
      cai: null,
      no2: null,
      so2: null,
      co: null,
    });

    const result = await service.getCurrentWeather();
    expect(result.pm25Status).toBe(AirStatus.BAD);
    expect(result.source).toBe(WeatherSource.LIVE);
  });

  it('근접측정소 조회 실패 시 REGIONS 근사표로 폴백', async () => {
    stationClient.fetchNearestStation.mockResolvedValue(null);
    kmaClient.fetchUvIndex.mockResolvedValue({
      current: 3,
      peak: null,
      peakHour: null,
    });
    airKoreaClient.fetchAirQuality.mockResolvedValue({
      ozone: null,
      pm25: null,
      pm10: null,
      cai: null,
      no2: null,
      so2: null,
      co: null,
    });

    // 서울 강남구 좌표 → 근사표의 강남구
    const result = await service.getCurrentWeather(37.5172, 127.0473);
    expect(result.regionName).toBe('서울특별시');
    // 폴백 시 강남구 측정소명 사용
    expect(airKoreaClient.fetchAirQuality).toHaveBeenCalledWith('강남구');
  });
});
