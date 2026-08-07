import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ProductService } from './product.service';
import { GeminiClient, GeminiUnavailable } from '../gemini/gemini.client';
import { PrismaService } from '../../prisma/prisma.service';
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
  let prisma: { product: { findMany: jest.Mock } };

  beforeEach(async () => {
    geminiClient = {
      generateWeatherProducts: jest.fn(),
    };
    prisma = {
      product: {
        findMany: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: GeminiClient, useValue: geminiClient },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(ProductService);
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

  describe('generateWeatherBased', () => {
    it('날씨 기반 제품 생성 — grade=A, reason, timing 포함', async () => {
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

      const result = await service.generateWeatherBased({ uvIndex: 5 });
      expect(result).toHaveLength(3);
      expect(result[0].matchedGrade).toBe(EvidenceGrade.A);
      expect(result[0].reason).toBe('오늘 습도가 낮아 보습 토너가 도움될 수 있어요.');
      expect(result[0].timing).toBe('세안 후');
      expect(result[0].category).toBe(ProductCategory.BARRIER);
      // 날씨 기반 제품은 영구 저장하지 않는다 — DB 미사용
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('Gemini 실패 시 503 ServiceUnavailable', async () => {
      geminiClient.generateWeatherProducts.mockRejectedValue(
        new GeminiUnavailable('GEMINI_API_KEY not configured'),
      );
      await expect(service.generateWeatherBased({})).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
