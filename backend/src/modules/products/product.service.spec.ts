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
 * 카탈로그 목록(category 필터 + purchaseUrl), 날씨 기반 제품 생성(reason/timing 계약,
 * N27 실제품 매핑·규칙 fallback·503) 검증.
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

  // N27: 실제 카탈로그 fixture — 모두 실제품이며 purchaseUrl을 가진다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productRow = (over: Partial<any> = {}): any => ({
    id: 'prod-11',
    name: '1025 독도 클렌저',
    brand: '라운드랩',
    imageUri: null,
    purchaseUrl: 'https://www.oliveyoung.co.kr/store/search/getSearch.do?query=%EB%8F%85%EB%8F%84',
    matchedGrade: 'B',
    matchedIngredients: ['약산성 클렌저'],
    category: 'barrier',
    reason: null,
    timing: null,
    createdAt: new Date(),
    ...over,
  });

  /** 규칙 fallback이 세 timing에 대해 실제품을 결정적으로 고를 수 있는 카탈로그. */
  const catalogRows = () => [
    productRow({ id: 'prod-11', category: 'barrier', matchedIngredients: ['약산성 클렌저'] }),
    productRow({
      id: 'prod-2',
      name: '자작나무 수분 선크림',
      category: 'barrier',
      matchedIngredients: ['징크옥사이드'],
    }),
    productRow({
      id: 'prod-13',
      name: '다이브인 히알루론산 세럼',
      brand: '토리든',
      category: 'moisture',
      matchedIngredients: ['히알루론산'],
    }),
    productRow({
      id: 'prod-26',
      name: '더 나이아신아마이드 15 세럼',
      brand: '코스알엑스',
      category: 'brightening',
      matchedIngredients: ['나이아신아마이드'],
    }),
    productRow({
      id: 'prod-5',
      name: '아토베리어 365 크림',
      brand: '아토베리어',
      category: 'barrier',
      matchedIngredients: ['세라마이드'],
    }),
  ];

  /** Gemini가 실제 카탈로그 id로 세 슬롯을 선택한 응답. */
  const validSelections = () => [
    { timing: '세안 후', productId: 'prod-11', explanation: '세안 후 피부결 정돈에 도움될 수 있어요.' },
    { timing: '외출 전', productId: 'prod-2', explanation: '외출 전 자외선 관리에 도움될 수 있어요.' },
    { timing: '외출 후', productId: 'prod-13', explanation: '외출 후 수분 보충에 도움될 수 있어요.' },
  ];

  describe('list', () => {
    it('카탈로그 전체 반환 (category 필터 없음) — purchaseUrl 포함 (N24)', async () => {
      prisma.product.findMany.mockResolvedValue([productRow()]);
      // limit 미지정이므로 배열 응답(비커서)이다.
      const result = (await service.list()) as ProductDto[];
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('prod-11');
      expect(result[0].matchedGrade).toBe(EvidenceGrade.B);
      expect(result[0].category).toBe(ProductCategory.BARRIER);
      expect(result[0].purchaseUrl).toBe(
        'https://www.oliveyoung.co.kr/store/search/getSearch.do?query=%EB%8F%85%EB%8F%84',
      );
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

  describe('generateWeatherBased (N12 서버 소유 날씨 + N27 실제품)', () => {
    it('LIVE 날씨 + Gemini 유효 선택 → 실제품 3개 (grade=A, reason, timing, purchaseUrl)', async () => {
      weatherService.getCurrentWeather.mockResolvedValue(liveWeather());
      prisma.product.findMany.mockResolvedValue(catalogRows());
      geminiClient.generateWeatherProducts.mockResolvedValue(validSelections());

      const result = await service.generateWeatherBased({ lat: 37.5, lon: 126.9 });
      expect(weatherService.getCurrentWeather).toHaveBeenCalledWith(37.5, 126.9);
      // 실제 카탈로그를 Gemini에 전달한다 (가상 제품 생성 아님).
      expect(geminiClient.generateWeatherProducts).toHaveBeenCalledWith(
        expect.objectContaining({ source: WeatherSource.LIVE }),
        expect.arrayContaining([expect.objectContaining({ id: 'prod-11' })]),
      );
      expect(result).toHaveLength(3);
      for (const p of result) {
        expect(p.matchedGrade).toBe(EvidenceGrade.A);
        expect(p.reason).toBeDefined();
        expect(p.timing).toBeDefined();
        expect(['세안 후', '외출 전', '외출 후']).toContain(p.timing);
        // N24: 노출 제품은 실제품 + purchaseUrl.
        expect(p.purchaseUrl).toBeDefined();
        expect(p.id).not.toMatch(/^gemini-product-/);
      }
      const timings = result.map((p) => p.timing).sort();
      expect(timings).toEqual(['세안 후', '외출 전', '외출 후']);
      expect(result[0].reason).toBe('세안 후 피부결 정돈에 도움될 수 있어요.');
    });

    it('Gemini 선택이 중복되면 규칙 기반 실제품으로 대체 (가상 제품 금지, N27)', async () => {
      weatherService.getCurrentWeather.mockResolvedValue(liveWeather());
      prisma.product.findMany.mockResolvedValue(catalogRows());
      // Gemini가 외출 전에도 prod-11(세안 후와 중복)을 잘못 선택했다.
      geminiClient.generateWeatherProducts.mockResolvedValue([
        { timing: '세안 후', productId: 'prod-11', explanation: 'E1' },
        { timing: '외출 전', productId: 'prod-11', explanation: 'E2' },
        { timing: '외출 후', productId: 'prod-13', explanation: 'E3' },
      ]);

      const result = await service.generateWeatherBased({ lat: 37.5, lon: 126.9 });
      expect(result).toHaveLength(3);
      const ids = result.map((p) => p.id);
      // 전부 실제 카탈로그 id이며 서로 다르다.
      expect(new Set(ids).size).toBe(3);
      for (const p of result) {
        expect(p.purchaseUrl).toBeDefined();
        expect(p.id).not.toMatch(/^gemini-product-/);
      }
      // 외출 전 슬롯은 규칙 fallback(징크옥사이드 barrier)으로 대체된다.
      const outbound = result.find((p) => p.timing === '외출 전');
      expect(outbound!.id).toBe('prod-2');
    });

    it('Gemini가 카탈로그에 없는 id를 고르면 규칙 기반 실제품으로 대체 (N27)', async () => {
      weatherService.getCurrentWeather.mockResolvedValue(liveWeather());
      prisma.product.findMany.mockResolvedValue(catalogRows());
      // Gemini가 'not-a-product' 같은 가상/잘못된 id를 선택했다 — 503이 아니라 규칙 fallback.
      geminiClient.generateWeatherProducts.mockResolvedValue([
        { timing: '세안 후', productId: 'prod-11', explanation: 'E1' },
        { timing: '외출 전', productId: 'not-a-product', explanation: 'E2' },
        { timing: '외출 후', productId: 'prod-13', explanation: 'E3' },
      ]);

      const result = await service.generateWeatherBased({ lat: 37.5, lon: 126.9 });
      expect(result).toHaveLength(3);
      for (const p of result) {
        expect(p.purchaseUrl).toBeDefined();
        expect(p.id).not.toMatch(/^gemini-product-/);
      }
      // 무효 선택 슬롯(외출 전)은 규칙 fallback(징크옥사이드 barrier)으로 대체된다.
      const outbound = result.find((p) => p.timing === '외출 전');
      expect(outbound!.id).toBe('prod-2');
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
      prisma.product.findMany.mockResolvedValue(catalogRows());
      geminiClient.generateWeatherProducts.mockResolvedValue(validSelections());

      const result = await service.generateWeatherBased({ lat: 37.5, lon: 126.9 });
      expect(result).toHaveLength(3);
      // fallback으로 구성된 날씨가 Gemini에 전달됐다 (uvIndex 3 = 스냅샷 값)
      expect(geminiClient.generateWeatherProducts).toHaveBeenCalledWith(
        expect.objectContaining({ uvIndex: 3, source: WeatherSource.CACHED }),
        expect.any(Array),
      );
      // 지역 우선 조회: UNAVAILABLE DTO의 regionName으로 같은 지역 스냅샷을 찾는다
      expect(prisma.weatherSnapshot.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.weatherSnapshot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ regionName: '서울특별시' }),
        }),
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

    it('카탈로그가 비어 있으면 503 (가상 제품 생성 금지, N27)', async () => {
      weatherService.getCurrentWeather.mockResolvedValue(liveWeather());
      prisma.product.findMany.mockResolvedValue([]);
      await expect(service.generateWeatherBased({})).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(geminiClient.generateWeatherProducts).not.toHaveBeenCalled();
    });

    it('Gemini 실패 시 503 ServiceUnavailable', async () => {
      weatherService.getCurrentWeather.mockResolvedValue(liveWeather());
      prisma.product.findMany.mockResolvedValue(catalogRows());
      geminiClient.generateWeatherProducts.mockRejectedValue(
        new GeminiUnavailable('GEMINI_API_KEY not configured'),
      );
      await expect(service.generateWeatherBased({})).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
