import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CatalogProduct,
  GeminiClient,
  GeminiUnavailable,
  GeneratedWeatherProduct,
  PRODUCT_TIMINGS,
} from '../gemini/gemini.client';
import { ProductCategory } from './enums/product-category.enum';
import { EvidenceGrade } from '../recommendations/enums/evidence-grade.enum';
import { ProductDto, ProductTiming } from './dto/product.dto';
import { WeatherProductsResponseDto } from './dto/weather-products-response.dto';
import { Prisma, Product, WeatherSnapshot } from '@prisma/client';
import { JobService } from '../jobs/job.service';
import { JobStateService } from '../jobs/job-state.service';
import { jobDedupeKeyOf } from '../jobs/job-dedupe';
import { JobType } from '../jobs/enums/job-type.enum';
import { JobStatus } from '../jobs/enums/job-status.enum';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { todayKst } from '../diagnosis/calendar-date.util';
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
 * 설계 기준 (BACKEND_TASKS.md T7 / N24 / N27):
 * - 제품 목록·category 필터 이식
 * - POST /products/weather-based 이식 — 피부 측정값 없이 날씨만으로 제품 생성
 * - 날씨 기반 제품의 reason, timing 응답 계약 유지
 * - **N24**: 모든 노출 제품은 DB 실제품이며 `purchaseUrl`을 포함한다.
 * - **N27**: Gemini는 카탈로그에서 productId를 선택한다. 가상 `gemini-product-*`를
 *   만들지 않는다. Gemini 선택이 유효하지 않거나 누락된 timing은 규칙 기반 실제품
 *   fallback으로 채운다. 카탈로그/날씨 조회가 불가능하면 503(가짜 데이터 금지).
 */
@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  /** 최근 스냅샷 fallback 허용 기간. 이 기간 안에 수집된 스냅샷만 오늘 날씨 대용으로 쓴다. */
  private static readonly SNAPSHOT_FALLBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  /** N32: 날씨 제품 Redis SWR 캐시 TTL(초). */
  private static readonly WEATHER_PRODUCTS_CACHE_TTL_S = 6 * 60 * 60;

  /** N32: CACHED 항목이 이 시간보다 오래되면 재검증(LIVE) job을 enqueue한다(SWR). */
  private static readonly WEATHER_PRODUCTS_REVALIDATE_MS = 30 * 60 * 1000;

  /** N32: 중복 enqueue 방지 job 조회 창. */
  private static readonly FAST_JOB_DEDUP_WINDOW_MS = 10 * 60 * 1000;

  /** N32: FAILED job이 이 시간 안이면 재사용(FALLBACK + 같은 jobId), 지나면 새 job. */
  private static readonly FAILED_COOLDOWN_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiClient: GeminiClient,
    private readonly weatherService: WeatherService,
    private readonly redis: RedisService,
    private readonly jobService: JobService,
    private readonly jobState: JobStateService,
    private readonly idempotency: IdempotencyService,
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
   * N27: 응답은 항상 DB 실제품(+purchaseUrl)이다. Gemini가 카탈로그에서 productId를
   * 고르고, 유효하지 않은 선택은 규칙 기반 실제품 fallback으로 대체한다.
   * 유저 비종속이므로 DB에 저장하지 않고 요청 시 생성한다(인증은 남용 방지 목적).
   */
  async generateWeatherBased(
    opts?: { lat?: number; lon?: number },
  ): Promise<ProductDto[]> {
    const weather = await this.resolveServerWeather(opts?.lat, opts?.lon);

    // N27: 실제 카탈로그만 사용. 카탈로그가 비어 있으면 가상 제품을 만들 수 없으므로 503.
    const catalog = await this.prisma.product.findMany();
    if (catalog.length === 0) {
      throw new ServiceUnavailableException(
        '추천할 실제 제품이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.',
      );
    }

    // Gemini가 카탈로그에서 productId를 고른다.
    let selections: GeneratedWeatherProduct[];
    try {
      selections = await this.geminiClient.generateWeatherProducts(
        { ...weather },
        catalog.map((p): CatalogProduct => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          matchedIngredients: p.matchedIngredients,
        })),
      );
    } catch (e) {
      if (e instanceof GeminiUnavailable) {
        throw new ServiceUnavailableException(
          'AI 추천을 생성할 수 없어요. 잠시 후 다시 시도해주세요.',
        );
      }
      throw e;
    }

    // 세 timing 슬롯을 채운다 — Gemini 선택이 유효한 실제품이면 그대로,
    // 아니면 규칙 기반 실제품 fallback (가상 gemini-product-* 생성 금지).
    const items = this.buildWeatherProducts(catalog, weather, selections);

    // N32: LIVE 생성 결과를 Redis SWR에 캐시한다 — 다음 빠른 경로가 source: CACHED.
    await this.cacheWeatherProducts(weather.regionName ?? 'base', items);

    return items;
  }

  /**
   * N32/N29: 날씨 기반 제품 빠른 경로 — 첫 응답에 실제품이 즉시 온다.
   *
   * 응답 우선순위:
   * 1. 같은 지역의 진행 중/완료 WEATHER_PRODUCTS_GENERATE job이 있으면 재사용
   *    (COMPLETED → `source: LIVE`, PENDING → `source: FALLBACK` + 같은 jobId).
   * 2. Redis SWR hit → `source: CACHED` (오래됐으면 재검증 job enqueue, jobId 포함).
   * 3. miss → 규칙 기반 실제품 `source: FALLBACK` 즉시 반환 + LIVE job enqueue.
   *
   * 날씨 조회 불가(UNAVAILABLE + 스냅샷 없음)는 기존대로 503 — 날씨 없이 가짜
   * 추천을 만들지 않는다(N12). Gemini 실패는 job이 비동기 FAILED가 된다(빈 화면 금지).
   */
  async generateWeatherBasedFast(
    userId: number,
    opts?: { lat?: number; lon?: number },
  ): Promise<WeatherProductsResponseDto> {
    const weather = await this.resolveServerWeather(opts?.lat, opts?.lon);
    const regionKey = weather.regionName ?? 'base';

    // N27: 실제 카탈로그만 사용. 카탈로그가 비어 있으면 가상 제품을 만들 수 없으므로 503.
    const catalog = await this.prisma.product.findMany();
    if (catalog.length === 0) {
      throw new ServiceUnavailableException(
        '추천할 실제 제품이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.',
      );
    }

    // 1) job dedup — 같은 지역의 진행 중/완료/최근 실패 job을 재사용한다.
    //    (FAILED도 cooldown 안이면 같은 jobId로 재사용해 job 스팸을 막는다 — N32)
    const job = await this.findWeatherProductsJob(userId, regionKey);
    if (job) {
      if (job.status === JobStatus.COMPLETED) {
        const result = job.result as { products?: ProductDto[] } | null;
        const items = result?.products ?? [];
        if (items.length > 0) {
          return {
            source: 'LIVE',
            jobId: job.id,
            generatedAt: job.finishedAt?.toISOString(),
            items,
          };
        }
      } else if (this.isRecentlyFailed(job)) {
        // Gemini 실패 직후 — 같은 jobId(FE가 FAILED를 볼 수 있게) + FALLBACK 유지.
        return {
          source: 'FALLBACK',
          jobId: job.id,
          items: this.buildWeatherProducts(catalog, weather, []),
        };
      } else if (job.status === JobStatus.PENDING) {
        // PENDING — 같은 job을 그대로 알려주고 규칙 FALLBACK을 먼저 보여준다.
        return {
          source: 'FALLBACK',
          jobId: job.id,
          items: this.buildWeatherProducts(catalog, weather, []),
        };
      }
      // FAILED가 cooldown을 지났으면 아래로 내려가 새 job을 enqueue한다.
    }

    // 2) Redis SWR hit → CACHED.
    const cacheKey = this.weatherProductsCacheKey(regionKey);
    const cached = await this.readWeatherCache(cacheKey);
    if (cached) {
      const stale =
        Date.now() - new Date(cached.generatedAt).getTime() >
        ProductService.WEATHER_PRODUCTS_REVALIDATE_MS;
      let jobId: string | undefined;
      if (stale) {
        // SWR: 낡은 데이터를 먼저 보여주고, 뒤에서 LIVE로 재검증한다.
        jobId = await this.enqueueWeatherProductsJob(userId, regionKey, opts);
      }
      return {
        source: 'CACHED',
        jobId,
        generatedAt: cached.generatedAt,
        items: cached.items,
      };
    }

    // 3) miss → 규칙 기반 실제품 FALLBACK 즉시 반환 + LIVE job enqueue.
    const fallback = this.buildWeatherProducts(catalog, weather, []);
    const jobId = await this.enqueueWeatherProductsJob(userId, regionKey, opts);
    return { source: 'FALLBACK', jobId, items: fallback };
  }

  // ── N32 빠른 경로 헬퍼 ──────────────────────────

  /**
   * 같은 지역키의 최근 job 조회 (중복 enqueue 방지).
   * R10: payload JSON 경로 비교 → `dedupeKey` 컬럼 조회로 바꿔 인덱스를 타게 했다.
   */
  private async findWeatherProductsJob(userId: number, regionKey: string) {
    return this.jobState.findRecentByDedupeKey({
      userId,
      type: JobType.WEATHER_PRODUCTS_GENERATE,
      dedupeKey: jobDedupeKeyOf('regionKey', regionKey),
      withinMs: ProductService.FAST_JOB_DEDUP_WINDOW_MS,
    });
  }

  /** FAILED가 cooldown 안이면 같은 jobId를 재사용한다 (job 스팸 방지). */
  private isRecentlyFailed(job: { status: string; finishedAt: Date | null }): boolean {
    return (
      job.status === JobStatus.FAILED &&
      !!job.finishedAt &&
      Date.now() - job.finishedAt.getTime() < ProductService.FAILED_COOLDOWN_MS
    );
  }

  /**
   * N31/N29: LIVE 교체 job을 enqueue한다.
   * 동일 사용자의 동시 요청이 같은 지역 job을 중복 enqueue하지 않도록 N14 reservation으로
   * 가드한다 — in-flight면 방금 생성된 job row를 찾아 재사용(Gemini 중복 호출 방지).
   * 실패해도 FALLBACK은 반환한다. scope는 (userId, 지역, KST 날짜) 단위다.
   */
  private async enqueueWeatherProductsJob(
    userId: number,
    regionKey: string,
    opts?: { lat?: number; lon?: number },
  ): Promise<string | undefined> {
    const scope = `weather-products:${userId}:${regionKey}:${todayKst()}`;
    const reservation = await this.idempotency.acquire(scope, userId);

    if (reservation.outcome === 'in_flight') {
      // 다른 요청이 enqueue 직전/직후 — job row를 찾아 재사용한다.
      const pending = await this.findWeatherProductsJob(userId, regionKey);
      if (pending) return pending.id;
      await sleepMs(200);
      const retry = await this.findWeatherProductsJob(userId, regionKey);
      return retry?.id;
    }

    const ownsReservation = reservation.outcome === 'acquired';
    try {
      const { jobId } = await this.jobService.enqueue(
        userId,
        JobType.WEATHER_PRODUCTS_GENERATE,
        { regionKey, lat: opts?.lat, lon: opts?.lon },
      );
      if (ownsReservation) {
        await this.idempotency.complete(scope);
      }
      return jobId;
    } catch (e) {
      if (ownsReservation) {
        await this.idempotency.release(scope);
      }
      this.logger.warn(
        `Fast path: weather products LIVE job enqueue failed (userId=${userId}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return undefined;
    }
  }

  /** 지역 + KST 날짜 기준 캐시 키 — 같은 날 같은 지역이면 동일 결과를 공유한다. */
  private weatherProductsCacheKey(regionKey: string): string {
    return `prod:weather:${regionKey}:${todayKst()}`;
  }

  private async readWeatherCache(
    key: string,
  ): Promise<{ items: ProductDto[]; generatedAt: string } | null> {
    return this.redis.getJson<{ items: ProductDto[]; generatedAt: string }>(key);
  }

  /** LIVE 생성 결과를 Redis SWR에 저장. Redis 장애 시 조용히 실패. */
  private async cacheWeatherProducts(
    regionKey: string,
    items: ProductDto[],
  ): Promise<void> {
    const key = this.weatherProductsCacheKey(regionKey);
    await this.redis.setJson(
      key,
      { items, generatedAt: new Date().toISOString() },
      ProductService.WEATHER_PRODUCTS_CACHE_TTL_S,
    );
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

  // ── N27 실제품 매핑·규칙 fallback ──────────────────────────

  /**
   * Gemini 선택 결과를 실제 카탈로그 제품으로 매핑한다.
   * 세 timing(세안 후/외출 전/외출 후)을 순서대로 채우며,
   * Gemini 선택이 (a) 카탈로그에 없거나 (b) 이미 사용된 제품이면 규칙 기반 실제품으로 대체한다.
   */
  private buildWeatherProducts(
    catalog: Product[],
    weather: WeatherSnapshotDto,
    selections: GeneratedWeatherProduct[],
  ): ProductDto[] {
    const byId = new Map(catalog.map((p) => [p.id, p]));
    const byTiming = new Map(selections.map((s) => [s.timing, s]));
    const used = new Set<string>();
    const result: ProductDto[] = [];

    for (const timing of PRODUCT_TIMINGS) {
      const sel = byTiming.get(timing);
      let product: Product | null = null;
      let reason: string | null = null;

      if (sel) {
        const candidate = byId.get(sel.productId);
        if (candidate && !used.has(candidate.id)) {
          product = candidate;
          reason = sel.explanation;
        }
      }

      if (!product) {
        product = this.pickRuleProduct(catalog, timing, used);
        reason = this.ruleReason(weather, timing);
      }
      used.add(product.id);
      result.push(this.weatherToDto(product, reason, timing));
    }
    return result;
  }

  /**
   * 규칙 기반 실제품 fallback — timing별 카테고리·성분 우선순위로 결정적으로 고른다.
   * (가상 제품 생성 금지: 카탈로그에 실제로 있는 제품만 선택)
   */
  private pickRuleProduct(
    catalog: Product[],
    timing: string,
    used: Set<string>,
  ): Product {
    const candidates = catalog.filter((p) => !used.has(p.id));
    const prefer = (pred: (p: Product) => boolean): Product | null =>
      candidates.find(pred) ?? null;

    let product: Product | null = null;
    if (timing === '세안 후') {
      product =
        prefer(
          (p) =>
            p.category === 'barrier' &&
            p.matchedIngredients.includes('약산성 클렌저'),
        ) ?? prefer((p) => p.category === 'moisture');
    } else if (timing === '외출 전') {
      product =
        prefer(
          (p) =>
            p.category === 'barrier' &&
            p.matchedIngredients.includes('징크옥사이드'),
        ) ?? prefer((p) => p.category === 'barrier');
    } else {
      // 외출 후
      product =
        prefer((p) => p.category === 'moisture') ??
        prefer((p) => p.category === 'barrier');
    }

    // 예외 방어: 조건이 전부 소진됐거나 카탈로그가 1개뿐이면 남은 아무 제품.
    // (실제 카탈로그는 30개 이상이라 used 소진은 일어나지 않는다 — 이 줄은 방어용이다.)
    return product ?? candidates[0] ?? catalog[0];
  }

  /** 규칙 fallback용 근거 문구 — 날씨 수치를 담되 의료 확정 표현을 쓰지 않는다. */
  private ruleReason(weather: WeatherSnapshotDto, timing: string): string {
    const uv =
      weather.uvIndex != null
        ? `자외선지수 ${weather.uvIndex}`
        : '자외선지수 측정 불가';
    const pm =
      weather.pm25 != null
        ? `미세먼지 ${weather.pm25}`
        : '미세먼지 측정 불가';
    return `${timing} 시점의 오늘 날씨(${uv}, ${pm})를 고려해 고른 실제 제품이에요. 피부 상태 유지에 도움될 수 있어요.`;
  }

  // ── 매핑 헬퍼 ──────────────────────────────────

  private catalogToDto(p: Product): ProductDto {
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      imageUri: p.imageUri,
      purchaseUrl: p.purchaseUrl,
      matchedGrade: p.matchedGrade as EvidenceGrade,
      matchedIngredients: p.matchedIngredients,
      category: p.category as ProductCategory,
      recommendationId: null,
      reason: p.reason,
      timing: (p.timing as ProductTiming | null) ?? null,
    };
  }

  /** 날씨 기반 제품 DTO — grade는 서버가 A로 고정, 실제품 메타를 그대로 노출한다. */
  private weatherToDto(
    p: Product,
    reason: string | null,
    timing: string,
  ): ProductDto {
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      imageUri: p.imageUri,
      purchaseUrl: p.purchaseUrl,
      matchedGrade: EvidenceGrade.A,
      matchedIngredients: p.matchedIngredients,
      category: p.category as ProductCategory,
      recommendationId: null,
      reason,
      timing: timing as ProductTiming,
    };
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
