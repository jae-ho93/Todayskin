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
import { Prisma, Product, WeatherSnapshot } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { WeatherService } from '../weather/weather.service';
import { WeatherSnapshotDto } from '../weather/dto/weather-snapshot.dto';
import { WeatherSource } from '../../common/enums/weather-source.enum';
import { AirStatus } from '../../common/enums/air-status.enum';
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

  /** 최근 스냅샷 fallback 허용 기간. 이 기간 안에 수집된 스냅샷만 오늘 날씨 대용으로 쓴다. */
  private static readonly SNAPSHOT_FALLBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiClient: GeminiClient,
    private readonly weatherService: WeatherService,
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
   * 날씨 기반(A등급) 제품 생성 (N12 — 서버 소유 날씨 계약).
   * 피부 측정값 없이 날씨 데이터만으로 세 상황(세안 후/외출 전/외출 후)별 제품을 생성.
   *
   * 클라이언트가 보낸 날씨를 신뢰하지 않는다. 좌표만 받아 서버가 WeatherService로
   * 오늘 날씨를 조회하고, 외부 API가 전부 실패(UNAVAILABLE)하면 최근 WeatherSnapshot을
   * fallback으로 사용한다. 조회 가능한 날씨가 전혀 없으면 가짜 데이터 대신 503을 반환한다.
   *
   * 응답에 reason(explanation), timing을 포함한다.
   * 유저 비종속이므로 DB에 저장하지 않고 요청 시 생성한다(인증은 남용 방지 목적).
   */
  async generateWeatherBased(
    opts?: { lat?: number; lon?: number },
  ): Promise<ProductDto[]> {
    const weather = await this.resolveServerWeather(opts?.lat, opts?.lon);

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

  // ── N12 서버 소유 날씨 구성 헬퍼 ──────────────────────────

  /**
   * 서버가 오늘 날씨를 직접 구성한다.
   * 1. WeatherService.getCurrentWeather — LIVE/CACHED면 그대로 사용.
   * 2. UNAVAILABLE이면 최근 WeatherSnapshot(7일)으로 fallback, source는 CACHED로 표기.
   * 3. 스냅샷도 없으면 503 — 측정 불가 상태를 가짜 데이터로 대체하지 않는다.
   */
  private async resolveServerWeather(
    lat?: number,
    lon?: number,
  ): Promise<WeatherSnapshotDto> {
    const live = await this.weatherService.getCurrentWeather(lat, lon);
    if (live.source !== WeatherSource.UNAVAILABLE) {
      return live;
    }

    this.logger.warn(
      'Weather-based products: live weather unavailable, falling back to recent snapshot',
    );
    // 저장 시 사용된 regionName을 그대로 조회 키로 쓴다. getCurrentWeather가
    // UNAVAILABLE이어도 regionName(측정소 lookup 결과)은 채워져 있으므로,
    // 정적 레지스트리를 재계산하는 것보다 저장 row와 정확히 같은 지역을 찾는다.
    const snapshot = await this.findRecentSnapshot(live.regionName);
    if (!snapshot) {
      throw new ServiceUnavailableException(
        '오늘 날씨 정보를 가져올 수 없어요. 잠시 후 다시 시도해주세요.',
      );
    }
    return this.snapshotToDto(snapshot);
  }

  /**
   * 최근 스냅샷 조회 — 같은 지역을 우선, 없으면 아무 지역 최신.
   * 정부 API가 전부 실패(UNAVAILABLE)해도 이번 좌표의 regionName은 알아낼 수 있으므로
   * 좌표 대신 regionName으로 같은 지역 스냅샷을 찾는다.
   */
  private async findRecentSnapshot(
    regionName: string,
  ): Promise<WeatherSnapshot | null> {
    const since = new Date(Date.now() - ProductService.SNAPSHOT_FALLBACK_WINDOW_MS);
    const base: Prisma.WeatherSnapshotWhereInput = { collectedAt: { gte: since } };

    const regionMatch = await this.prisma.weatherSnapshot.findFirst({
      where: { ...base, regionName },
      orderBy: { collectedAt: 'desc' },
    });
    if (regionMatch) return regionMatch;

    return this.prisma.weatherSnapshot.findFirst({
      where: base,
      orderBy: { collectedAt: 'desc' },
    });
  }

  /** WeatherSnapshot row → 응답 DTO. 출처는 CACHED로 표기해 "라이브가 아님"을 명시한다. */
  private snapshotToDto(s: WeatherSnapshot): WeatherSnapshotDto {
    const dto = new WeatherSnapshotDto();
    dto.observedAt = s.observedAt.toISOString();
    dto.regionName = s.regionName;
    dto.source = WeatherSource.CACHED;
    dto.uvIndex = s.uvIndex;
    dto.uvStatus = s.uvStatus as AirStatus;
    dto.uvIndexPeak = s.uvIndexPeak;
    dto.uvStatusPeak = s.uvStatusPeak as AirStatus;
    dto.uvIndexPeakHour = s.uvIndexPeakHour;
    dto.ozonePpm = s.ozonePpm;
    dto.ozoneStatus = s.ozoneStatus as AirStatus;
    dto.pm25 = s.pm25;
    dto.pm25Status = s.pm25Status as AirStatus;
    dto.pm10 = s.pm10;
    dto.pm10Status = s.pm10Status as AirStatus;
    dto.caiValue = s.caiValue;
    dto.caiStatus = s.caiStatus as AirStatus;
    dto.no2Value = s.no2Value;
    dto.so2Value = s.so2Value;
    dto.coValue = s.coValue;
    return dto;
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
