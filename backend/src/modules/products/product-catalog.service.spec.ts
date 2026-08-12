import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ProductCatalogService } from './product-catalog.service';

/**
 * R9: 캐시 hit/miss와 Redis 장애 시 동작. 카탈로그는 시드로만 바뀌므로
 * "언제 DB를 다시 읽는가"가 이 클래스의 전부다.
 */
describe('ProductCatalogService', () => {
  let service: ProductCatalogService;
  let prisma: { product: { findMany: jest.Mock } };
  let redis: {
    isAvailable: jest.Mock;
    getJson: jest.Mock;
    setJson: jest.Mock;
    invalidate: jest.Mock;
  };

  const row = (id: string) => ({
    id,
    name: '제품',
    brand: '브랜드',
    imageUri: null,
    purchaseUrl: null,
    matchedGrade: 'A',
    matchedIngredients: ['히알루론산'],
    category: 'moisture',
    reason: null,
    timing: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });

  beforeEach(async () => {
    prisma = { product: { findMany: jest.fn().mockResolvedValue([row('p1')]) } };
    redis = {
      isAvailable: jest.fn().mockReturnValue(true),
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(true),
      invalidate: jest.fn().mockResolvedValue(true),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductCatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = moduleRef.get(ProductCatalogService);
  });

  it('캐시 miss면 DB에서 읽고 TTL과 함께 저장한다', async () => {
    const rows = await service.load();

    expect(rows.map((p) => p.id)).toEqual(['p1']);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(redis.setJson).toHaveBeenCalledWith(
      'product:catalog:v1',
      rows,
      ProductCatalogService.CACHE_TTL_SECONDS,
    );
  });

  it('캐시 hit면 DB를 건너뛴다', async () => {
    redis.getJson.mockResolvedValue([
      { ...row('cached'), createdAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const rows = await service.load();

    expect(rows.map((p) => p.id)).toEqual(['cached']);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('캐시에서 읽은 createdAt은 Date로 되돌린다 (정렬·커서가 문자열 비교가 되지 않게)', async () => {
    redis.getJson.mockResolvedValue([
      { ...row('cached'), createdAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const [product] = await service.load();

    expect(product.createdAt).toBeInstanceOf(Date);
    expect(product.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('Redis가 없으면 프로세스 내 캐시로 TTL 동안 DB를 한 번만 읽는다', async () => {
    redis.isAvailable.mockReturnValue(false);

    await service.load();
    await service.load();

    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(redis.getJson).not.toHaveBeenCalled();
  });

  it('invalidate 후에는 Redis 키를 지우고 프로세스 캐시도 버린다', async () => {
    redis.isAvailable.mockReturnValue(false);
    await service.load();

    await service.invalidate();
    await service.load();

    expect(redis.invalidate).toHaveBeenCalledWith('product:catalog:v1');
    expect(prisma.product.findMany).toHaveBeenCalledTimes(2);
  });
});
