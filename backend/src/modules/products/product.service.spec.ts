import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ProductService } from './product.service';
import { GeminiClient, GeminiUnavailable } from '../gemini/gemini.client';
import { PrismaService } from '../../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import { WeatherSource } from '../../common/enums/weather-source.enum';
import { ProductCategory } from './enums/product-category.enum';
import { EvidenceGrade } from '../recommendations/enums/evidence-grade.enum';
import { ProductDto } from './dto/product.dto';

/**
 * ProductService 단위 테스트.
 * 카탈로그 목록(category 필터), 날씨 기반 제품 생성(reason/timing 계약, 503) 검증.
 */
describe('ProductService', () => {
  let service: ProductService;
  let geminiClient: { generateWeatherProducts: jest.Mock };
  let weatherService: { getCurrentWeather: jest.Mock };
  let prisma: {
    product: { findMany: jest.Mock };
    weatherSnapshot: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    geminiClient = {
      generateWeatherProducts: jest.fn(),
    };
    weatherService = { getCurrentWeather: jest.fn() };
    prisma = {
      product: {
        findMany: jest.fn(),
      },
      weatherSnapshot: {
        findFirst: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: GeminiClient, useValue: geminiClient },
        { provide: WeatherService, useValue: weatherService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(ProductService);
  });

  // N12: 서버 소유 날씨 — LIVE 응답을 반환하는 기본 mock.
  const liveWeather = () => ({
    source: WeatherSource.LIVE,
    observedAt: '2026-08-04T06:30:00.000Z',
    regionName: '서울특별시',
    uvIndex: 5,
    uvStatus: 'moderate',
    uvIndexPeak: null,
    uvStatusPeak: null,
    uvIndexPeakHour: null,
    ozonePpm: null,
    ozoneStatus: null,
    pm25: 12,
    pm25Status: 'good',
    pm10: null,
    pm10Status: null,
    caiValue: null,
    caiStatus: null,
    no2Value: null,
    so2Value: null,
    coValue: null,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productRow = (over: Partial<any> = {}): any => ({
    id: 'prod-1',
    name: '데일리 UV 디펜스 선크림',
    brand: 'Skinlab',
    imageUri: null,
    matchedGrade: 'A',
    matchedIngredients: ['징크옥사이드', '나이아신아마이드'],
    category: 'barrier',
    reason: null,
    timing: null,
    createdAt: new Date(),
    ...over,
  });

  describe('list', () => {
    it('카탈로그 전체 반환 (category 필터 없음)', async () => {
      prisma.product.findMany.mockResolvedValue([productRow()]);
      // limit 미지정이므로 배열 응답(비커서)이다.
      const result = (await service.list()) as ProductDto[];
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('prod-1');
      expect(result[0].matchedGrade).toBe(EvidenceGrade.A);
      expect(result[0].category).toBe(ProductCategory.BARRIER);
    });

    it('category 필터 전달', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.list(ProductCategory.MOISTURE);
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { category: ProductCategory.MOISTURE },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: undefined,
      });
    });
  });

  describe('generateWeatherBased (N12 서버 소유 날씨)', () => {
    it('서버가 조회한 LIVE 날씨로 제품 생성 — grade=A, reason, timing 포함', async () => {
      weatherService.getCurrentWeather.mockResolvedValue(liveWeather());
      geminiClient.generateWeatherProducts.mockResolvedValue([
        {
          timing: '세안 후',
          category: 'barrier',
          name: '릴렉싱 토너',
          brand: 'LabSkin',
          explanation: '오늘 습도가 낮아 보습 토너가 도움될 수 있어요.',
          ingredientTags: ['히알루론산', '나이아신아마이드'],
        },
        {
          timing: '외출 전',
          category: 'barrier',
          name: '데일리 실드',
          brand: 'LabSkin',
          explanation: '자외선 차단.',
          ingredientTags: ['징크옥사이드'],
        },
        {
          timing: '외출 후',
          category: 'moisture',
          name: '수분 미스트',
          brand: 'LabSkin',
          explanation: '미세먼지 노출 후 수분 보충.',
          ingredientTags: ['판테놀'],
        },
      ]);

      const result = await service.generateWeatherBased({ lat: 37.5, lon: 126.9 });
      expect(weatherService.getCurrentWeather).toHaveBeenCalledWith(37.5, 126.9);
      expect(result).toHaveLength(3);
      expect(result[0].matchedGrade).toBe(EvidenceGrade.A);
      expect(result[0].reason).toBe('오늘 습도가 낮아 보습 토너가 도움될 수 있어요.');
      expect(result[0].timing).toBe('세안 후');
      expect(result[0].category).toBe(ProductCategory.BARRIER);
      // 날씨 기반 제품은 영구 저장하지 않는다 — DB 미사용
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('외부 API UNAVAILABLE 시 최근 WeatherSnapshot으로 fallback', async () => {
      weatherService.getCurrentWeather.mockResolvedValue({
        source: WeatherSource.UNAVAILABLE,
        observedAt: new Date().toISOString(),
        regionName: '서울특별시',
        uvIndex: null,
        uvStatus: null,
        uvIndexPeak: null,
        uvStatusPeak: null,
        uvIndexPeakHour: null,
        ozonePpm: null,
        ozoneStatus: null,
        pm25: null,
        pm25Status: null,
        pm10: null,
        pm10Status: null,
        caiValue: null,
        caiStatus: null,
        no2Value: null,
        so2Value: null,
        coValue: null,
      });
      prisma.weatherSnapshot.findFirst.mockResolvedValue({
        observedAt: new Date('2026-08-04T06:30:00Z'),
        regionName: '서울특별시',
        source: 'LIVE',
        uvIndex: 3,
        uvStatus: 'good',
        uvIndexPeak: null,
        uvStatusPeak: null,
        uvIndexPeakHour: null,
        ozonePpm: null,
        ozoneStatus: null,
        pm25: 10,
        pm25Status: 'good',
        pm10: null,
        pm10Status: null,
        caiValue: null,
        caiStatus: null,
        no2Value: null,
        so2Value: null,
        coValue: null,
      });
      geminiClient.generateWeatherProducts.mockResolvedValue([
        { timing: '세안 후', category: 'barrier', name: 'N', brand: 'B', explanation: 'E', ingredientTags: [] },
        { timing: '외출 전', category: 'barrier', name: 'N', brand: 'B', explanation: 'E', ingredientTags: [] },
        { timing: '외출 후', category: 'moisture', name: 'N', brand: 'B', explanation: 'E', ingredientTags: [] },
      ]);

      const result = await service.generateWeatherBased({ lat: 37.5, lon: 126.9 });
      expect(result).toHaveLength(3);
      // fallback으로 구성된 날씨가 Gemini에 전달됐다 (uvIndex 3 = 스냅샷 값)
      expect(geminiClient.generateWeatherProducts).toHaveBeenCalledWith(
        expect.objectContaining({ uvIndex: 3, source: WeatherSource.CACHED }),
      );
      // 지역 우선 조회: UNAVAILABLE DTO의 regionName으로 같은 지역 스냅샷을 찾는다
      expect(prisma.weatherSnapshot.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.weatherSnapshot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ regionName: '서울특별시' }),
        }),
      );
    });

    it('같은 지역 스냅샷 없음 → 아무 지역 최신 스냅샷으로 fallback', async () => {
      weatherService.getCurrentWeather.mockResolvedValue({
        source: WeatherSource.UNAVAILABLE,
        observedAt: new Date().toISOString(),
        regionName: '서울특별시',
        uvIndex: null,
      });
      prisma.weatherSnapshot.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          observedAt: new Date('2026-08-04T06:30:00Z'),
          regionName: '부산광역시',
          source: 'LIVE',
          uvIndex: 4,
          uvStatus: 'good',
          uvIndexPeak: null,
          uvStatusPeak: null,
          uvIndexPeakHour: null,
          ozonePpm: null,
          ozoneStatus: null,
          pm25: 15,
          pm25Status: 'good',
          pm10: null,
          pm10Status: null,
          caiValue: null,
          caiStatus: null,
          no2Value: null,
          so2Value: null,
          coValue: null,
        });
      geminiClient.generateWeatherProducts.mockResolvedValue([
        { timing: '세안 후', category: 'barrier', name: 'N', brand: 'B', explanation: 'E', ingredientTags: [] },
        { timing: '외출 전', category: 'barrier', name: 'N', brand: 'B', explanation: 'E', ingredientTags: [] },
        { timing: '외출 후', category: 'moisture', name: 'N', brand: 'B', explanation: 'E', ingredientTags: [] },
      ]);

      const result = await service.generateWeatherBased({ lat: 37.5, lon: 126.9 });
      expect(result).toHaveLength(3);
      // 지역 매칭 실패(1회) 후 지역 조건 없이 최신 스냅샷(2회) 조회
      expect(prisma.weatherSnapshot.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.weatherSnapshot.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            regionName: expect.anything(),
          }),
        }),
      );
      expect(geminiClient.generateWeatherProducts).toHaveBeenCalledWith(
        expect.objectContaining({ uvIndex: 4, source: WeatherSource.CACHED }),
      );
    });

    it('외부 API UNAVAILABLE + 최근 스냅샷 없음 → 503', async () => {
      weatherService.getCurrentWeather.mockResolvedValue({
        source: WeatherSource.UNAVAILABLE,
        observedAt: new Date().toISOString(),
        regionName: '서울특별시',
        uvIndex: null,
      });
      prisma.weatherSnapshot.findFirst.mockResolvedValue(null);

      await expect(service.generateWeatherBased({})).rejects.toThrow(
        ServiceUnavailableException,
      );
      // 지역 우선 + 아무 지역 최신까지 모두 빈 결과
      expect(prisma.weatherSnapshot.findFirst).toHaveBeenCalledTimes(2);
      expect(geminiClient.generateWeatherProducts).not.toHaveBeenCalled();
    });

    it('Gemini 실패 시 503 ServiceUnavailable', async () => {
      weatherService.getCurrentWeather.mockResolvedValue(liveWeather());
      geminiClient.generateWeatherProducts.mockRejectedValue(
        new GeminiUnavailable('GEMINI_API_KEY not configured'),
      );
      await expect(service.generateWeatherBased({})).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
