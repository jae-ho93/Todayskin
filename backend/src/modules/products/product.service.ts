import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiClient, GeminiUnavailable } from '../gemini/gemini.client';
import { ProductCategory } from './enums/product-category.enum';
import { EvidenceGrade } from '../recommendations/enums/evidence-grade.enum';
import { ProductDto, ProductTiming } from './dto/product.dto';
import { Product } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { WeatherInputDto } from '../weather/dto/weather-snapshot.dto';
import {
  buildCursorPage,
  CursorPageDto,
  decodeCursor,
} from '../../common/pagination/cursor-pagination';

/**
 * ProductService — 제품 카탈로그 목록과 날씨 기반 제품 생성.
 *
 * 설계 기준 (BACKEND_TASKS.md T7):
 * - 제품 목록·category 필터 이식
 * - POST /products/weather-based 이식 — 피부 측정값 없이 날씨만으로 제품 생성
 * - 날씨 기반 제품의 reason, timing 응답 계약 유지
 * - 날씨 기반 제품은 영구 저장하지 않고 요청 시 생성(유저 비종속)
 * - Gemini 실패 시 503, 가짜 제품으로 대체하지 않음
 */
@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiClient: GeminiClient,
  ) {}

  /**
   * 제품 카탈로그 목록.
   * 기존 FastAPI /products — category 필터 적용 가능.
   * DB의 Product 테이블(seed 카탈로그)에서 조회한다.
   */
  async list(
    category?: ProductCategory,
    opts?: { limit?: number; cursor?: string },
  ): Promise<ProductDto[] | CursorPageDto<ProductDto>> {
    const decoded = decodeCursor(opts?.cursor);
    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (decoded) {
      const at = decoded.at ? new Date(decoded.at) : null;
      where.OR = at
        ? [
            { createdAt: { gt: at } },
            { createdAt: at, id: { gt: decoded.id } },
          ]
        : [{ id: { gt: decoded.id } }];
    }
    const take = opts?.limit;
    const products = await this.prisma.product.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: take ? take + 1 : undefined,
    });
    const items = products.map((p) => this.catalogToDto(p));
    if (!take) return items;
    return buildCursorPage(items, take, (row) => {
      const raw = products.find((p) => p.id === row.id);
      return raw?.createdAt;
    });
  }

  /**
   * 날씨 기반(A등급) 제품 생성.
   * 피부 측정값 없이 날씨 데이터만으로 세 상황(세안 후/외출 전/외출 후)별 제품을 생성.
   *
   * 응답에 reason(explanation), timing을 포함한다.
   * 유저 비종속이므로 DB에 저장하지 않고 요청 시 생성한다.
   *
   * 클라이언트가 보낸 날씨를 그대로 신뢰하지 않는다(최종 구조에서는 서버가 조회).
   * 현재는 프론트가 보낸 날씨를 Gemini 입력으로 사용한다(contract migration 전까지).
   */
  async generateWeatherBased(
    weather: WeatherInputDto,
  ): Promise<ProductDto[]> {
    let items;
    try {
      items = await this.geminiClient.generateWeatherProducts({ ...weather });
    } catch (e) {
      if (e instanceof GeminiUnavailable) {
        throw new ServiceUnavailableException(
          'AI 추천을 생성할 수 없어요. 잠시 후 다시 시도해주세요.',
        );
      }
      throw e;
    }

    // 서버가 grade=A를 고정한다.
    return items.map((item) => {
      const id = `gemini-product-${this.shortId()}`;
      const dto: ProductDto = {
        id,
        name: item.name,
        brand: item.brand,
        imageUri: null,
        matchedGrade: EvidenceGrade.A,
        matchedIngredients: item.ingredientTags,
        category: item.category as ProductCategory,
        recommendationId: null,
        reason: item.explanation,
        timing: item.timing as ProductTiming,
      };
      return dto;
    });
  }

  // ── 매핑 헬퍼 ──────────────────────────────────

  private catalogToDto(p: Product): ProductDto {
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      imageUri: p.imageUri,
      matchedGrade: p.matchedGrade as EvidenceGrade,
      matchedIngredients: p.matchedIngredients,
      category: p.category as ProductCategory,
      recommendationId: null,
      reason: p.reason,
      timing: (p.timing as ProductTiming | null) ?? null,
    };
  }

  private shortId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 20);
  }
}
