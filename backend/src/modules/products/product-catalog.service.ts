import { Injectable, Logger } from '@nestjs/common';
import { Product } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * R9: 제품 카탈로그 읽기 한 곳 + TTL 캐시.
 *
 * 카탈로그는 `prisma db seed`로만 바뀌는 참조 데이터인데 추천·날씨 제품 경로가
 * 요청마다(때로는 한 요청에 두 번) 전량을 다시 읽고 있었다. 건수가 늘수록 전송량과
 * 역직렬화 비용이 요청 수에 비례해 커진다.
 *
 * 무효화: 백엔드에 상품 쓰기 경로가 없어 "관리자가 수정하면 지운다"를 붙일 곳이 없다.
 * 대신 (1) TTL 10분으로 자동 만료하고, (2) 시드 직후 즉시 반영이 필요하면 관리자가
 * `POST /admin/products/cache/invalidate`로 비운다.
 *
 * Redis 미가용 시에는 프로세스 내 캐시로 같은 TTL을 유지한다. 인스턴스마다 최대
 * TTL만큼 다른 스냅샷을 볼 수 있지만, 시드로만 바뀌는 데이터라 감수할 만하다.
 */
@Injectable()
export class ProductCatalogService {
  private readonly logger = new Logger(ProductCatalogService.name);

  private static readonly CACHE_KEY = 'product:catalog:v1';
  static readonly CACHE_TTL_SECONDS = 10 * 60;

  /** Redis 미가용일 때만 쓰는 프로세스 내 캐시. */
  private local: { rows: Product[]; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 카탈로그 전량. 캐시 hit면 DB를 건너뛴다. */
  async load(): Promise<Product[]> {
    if (!this.redis.isAvailable()) return this.loadWithLocalCache();

    const cached = await this.redis.getJson<SerializedProduct[]>(
      ProductCatalogService.CACHE_KEY,
    );
    if (cached) return cached.map(reviveProduct);

    const rows = await this.prisma.product.findMany();
    await this.redis.setJson(
      ProductCatalogService.CACHE_KEY,
      rows,
      ProductCatalogService.CACHE_TTL_SECONDS,
    );
    return rows;
  }

  /** 캐시를 비운다(시드 직후 즉시 반영용). Redis·프로세스 캐시 둘 다 지운다. */
  async invalidate(): Promise<void> {
    this.local = null;
    await this.redis.invalidate(ProductCatalogService.CACHE_KEY);
    this.logger.log('제품 카탈로그 캐시를 비웠다 — 다음 요청이 DB에서 다시 읽는다');
  }

  private async loadWithLocalCache(): Promise<Product[]> {
    if (this.local && this.local.expiresAt > Date.now()) return this.local.rows;

    const rows = await this.prisma.product.findMany();
    this.local = {
      rows,
      expiresAt: Date.now() + ProductCatalogService.CACHE_TTL_SECONDS * 1000,
    };
    return rows;
  }
}

/** JSON 왕복 후의 카탈로그 행 — Date가 문자열로 바뀐다. */
type SerializedProduct = Omit<Product, 'createdAt'> & { createdAt: string };

/**
 * 캐시에서 읽은 행의 `createdAt`을 Date로 되돌린다. 캐시 hit/miss에 따라 타입이
 * 달라지면 호출부가 조용히 어긋난다(정렬·커서가 문자열 비교로 바뀌는 식).
 */
function reviveProduct(row: SerializedProduct): Product {
  return { ...row, createdAt: new Date(row.createdAt) };
}
