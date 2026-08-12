import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, Product, Recommendation as RecommendationModel } from '@prisma/client';
import { createHash } from 'node:crypto';
import { GeminiClient, GeminiUnavailable } from '../gemini/gemini.client';
import { ConsentService } from '../consent/consent.service';
import { ConsentPurpose } from '../consent/enums/consent-purpose.enum';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { JobService } from '../jobs/job.service';
import { jobDedupeKeyOf } from '../jobs/job-dedupe';
import { JobType } from '../jobs/enums/job-type.enum';
import { FastPathCoordinator } from '../jobs/fast-path.coordinator';
import { EvidenceGrade } from './enums/evidence-grade.enum';
import { RecommendationDto, RecommendationTiming } from './dto/recommendation.dto';
import { RecommendationFastResponseDto } from './dto/recommendation-fast-response.dto';
import {
  buildCursorPage,
  CursorPageDto,
  decodeCursor,
} from '../../common/pagination/cursor-pagination';
import {
  GeneratedRecommendationRow,
  RecommendationProductLink,
  RecommendationRepository,
} from './recommendation.repository';
import { modelToDto, snapshotToInput, templateToDto } from './recommendation.mapper';
import {
  buildRuleRecommendations,
  MATCHLESS_FALLBACK_PRODUCT_COUNT,
  pickMatchlessProducts,
  shortId,
} from './recommendation.fallback';
import { B_GRADE_SOURCE_LABEL } from './content/fallback-content';
import { ProductCatalogService } from '../products/product-catalog.service';

/**
 * RecommendationService — 전역 추천 템플릿 목록, B등급 생성, 빠른 경로, 상세 조회.
 *
 * 설계 기준 (BACKEND_TASKS.md T7/T8 + N32/N29):
 * - 전역 A등급 템플릿과 사용자별 생성 추천을 분리한다.
 * - grade/sourceLabel은 서버가 고정하고 LLM이 결정하지 않는다.
 * - 추천 생성은 diagnosisId 중심(최종 계약)을 지원하되, 기존 프론트의
 *   skinScore+weather 직접 전송도 호환한다(contract migration 전까지).
 * - 동일 진단에 대한 중복 생성을 방지한다.
 * - 추천 상세 조회 시 사용자 소유권을 검사한다.
 * - Gemini 실패 시 503을 반환하고 가짜 추천으로 대체하지 않는다 (동기 경로).
 * - **N32/N29**: `generateFast`는 DB LIVE → job dedup → Redis SWR(CACHED) →
 *   규칙 기반 실제품(FALLBACK) + LIVE job enqueue 순서로 첫 응답을 즉시 반환한다.
 *   FALLBACK/CACHED 응답에는 항상 jobId가 붙어 FE가 GET /jobs/:id로 LIVE로 교체한다.
 *
 * R7: 이 클래스는 유스케이스 순서만 담는다. DB 접근은 `RecommendationRepository`,
 * DTO 변환은 `recommendation.mapper`, 규칙 기반 결과와 제품 선택은
 * `recommendation.fallback`, 노출 문구는 `content/fallback-content`에 있다.
 */
@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly repo: RecommendationRepository,
    private readonly geminiClient: GeminiClient,
    private readonly consentService: ConsentService,
    private readonly idempotency: IdempotencyService,
    private readonly jobService: JobService,
    private readonly fastPath: FastPathCoordinator,
    private readonly catalog: ProductCatalogService,
  ) {}

  /**
   * 전역 추천 카탈로그(user 비종속).
   * 기존 FastAPI /recommendations — user_id가 null인 레코드만.
   * grade 필터 적용 가능.
   */
  async listGlobal(
    grade?: EvidenceGrade,
    opts?: { limit?: number; cursor?: string },
  ): Promise<RecommendationDto[] | CursorPageDto<RecommendationDto>> {
    // RecommendationTemplate은 전역(user 비종속) 테이블이라 userId 필드가 없다.
    const decoded = decodeCursor(opts?.cursor);
    const where: Prisma.RecommendationTemplateWhereInput = {};
    if (grade) where.grade = grade;
    if (decoded) {
      const at = decoded.at ? new Date(decoded.at) : null;
      where.OR = at
        ? [{ createdAt: { gt: at } }, { createdAt: at, id: { gt: decoded.id } }]
        : [{ id: { gt: decoded.id } }];
    }
    const take = opts?.limit;
    const templates = await this.repo.findTemplates({
      where,
      take: take ? take + 1 : undefined,
    });
    // N20: 관련 제품 id를 일괄 조회해 N+1 없이 채운다.
    const productIdsByTemplate = await this.repo.productIdsByTemplateIds(
      templates.map((t) => t.id),
    );
    const items = templates.map((row) =>
      templateToDto(row, productIdsByTemplate.get(row.id) ?? []),
    );
    if (!take) return items;
    return buildCursorPage(items, take, (row) => {
      const raw = templates.find((x) => x.id === row.id);
      return raw?.createdAt;
    });
  }

  /**
   * B등급 추천 생성 — 피부 측정값 + 날씨를 Gemini에 전달.
   *
   * 최종 계약: diagnosisId만 받아 서버가 소유권 확인 후 DB에서 측정값/날씨를 조회한다.
   * 호환: diagnosisId 없이 skinScore+weather를 직접 받는 기존 프론트도 지원한다.
   *
   * 동일 진단에 대해 이미 생성된 추천이 있으면 중복 생성 대신 기존 것을 반환한다.
   * N32: 성공한 LIVE 결과를 Redis SWR에 캐시해 다음 빠른 경로가 source: CACHED로
   * 즉시 응답할 수 있게 한다.
   */
  async generate(
    userId: number,
    payload: {
      diagnosisId?: string;
      skinScore?: Record<string, unknown>;
      weather?: object;
    },
  ): Promise<RecommendationDto[]> {
    // N3: Gemini 등 외부 AI로 피부/날씨 데이터를 보내려면 전송 동의 필수.
    await this.consentService.requireActive(
      userId,
      ConsentPurpose.AI_RECOMMENDATION_DATA_TRANSFER,
    );

    const { diagnosisId, skinInput, weatherInput } =
      await this.resolveGenerateInputs(userId, payload);

    // 동일 진단에 대한 중복 생성 방지.
    // diagnosisId가 있고 이미 추천이 존재하면 기존 것을 반환한다.
    if (diagnosisId) {
      const existing = await this.repo.findByDiagnosis(userId, diagnosisId);
      if (existing.length > 0) {
        this.logger.debug(
          `Recommendations already exist for diagnosis ${diagnosisId}, returning existing`,
        );
        return this.attachProductIds(existing);
      }
    }

    const reservationScope = await this.acquireGenerateReservation(userId, diagnosisId);
    if (reservationScope?.existing) return reservationScope.existing;

    try {
      const items = await this.callGemini(skinInput, weatherInput);

      // 서버가 grade=B, sourceLabel을 고정한다. 모든 row를 먼저 구성한 뒤 하나의
      // 트랜잭션에서 일괄 저장한다 — item별 순차 create는 중간 DB 오류 때 추천이
      // 일부만 남는다.
      const createdAt = new Date();
      const rows: GeneratedRecommendationRow[] = items.map((item) => ({
        id: `gemini-${shortId()}`,
        userId,
        diagnosisId: diagnosisId ?? null,
        title: item.title,
        grade: EvidenceGrade.B,
        sourceLabel: B_GRADE_SOURCE_LABEL,
        explanation: item.explanation,
        observationalNote: null,
        ingredientTags: item.ingredientTags,
        timing: (item.timing as RecommendationTiming | null) ?? null,
      }));

      // N20: 추천의 성분 태그와 제품의 matchedIngredients 교집합으로 연결한다.
      // 카탈로그는 seed/관리자만 바꾸는 정적 데이터라 트랜잭션 밖 조회와 저장 사이의
      // 경쟁은 무시할 만하다. (제품 수가 적어 메모리 매칭)
      const catalog = await this.catalog.load();
      const links = this.buildProductLinks(
        rows,
        items.map((i) => i.ingredientTags ?? []),
        catalog,
      );

      const persisted = await this.repo.createGenerated({
        userId,
        diagnosisId: diagnosisId ?? null,
        rows,
        links,
        createdAt,
      });

      // N14: 성공 시 예약을 COMPLETED로 전환 — 이후 재시도는 동일 결과를 재반환받는다.
      if (reservationScope) {
        await this.idempotency.complete(reservationScope.scope);
      }

      // 방금 저장한 추천들에도 관련 제품 id를 채운다.
      const dtos = await this.attachProductIds(persisted);

      // N32: LIVE 생성 결과를 Redis SWR에 캐시한다 — 다음 빠른 경로가 source: CACHED.
      if (diagnosisId) {
        await this.fastPath.writeCache(this.diagnosisCacheKey(userId, diagnosisId), dtos);
      }

      return dtos;
    } catch (e) {
      // N14: 실패(503/저장 오류) 시 예약을 해제해 재시도가 가능하게 한다.
      if (reservationScope) {
        await this.idempotency.release(reservationScope.scope);
      }
      throw e;
    }
  }

  /**
   * N32/N29: 빠른 경로 추천 — 첫 응답에 실제품이 즉시 온다.
   *
   * 응답 우선순위:
   * 1. diagnosisId 모드에서 저장된 추천이 이미 있으면 `source: LIVE`로 즉시 반환.
   * 2. 같은 진단의 진행 중/완료 job이 있으면 그 job을 재사용 (중복 enqueue 방지).
   * 3. Redis SWR hit → `source: CACHED` (오래됐으면 재검증 job enqueue, jobId 포함).
   * 4. miss → 규칙 기반 실제품 `source: FALLBACK` 즉시 반환 + LIVE job enqueue.
   *
   * Gemini 실패는 이 경로에서 503을 만들지 않는다 — job이 비동기로 FAILED가 되고
   * FE는 FALLBACK을 유지한다 (빈 화면·긴 동기 Gemini 대기 금지, N32).
   */
  async generateFast(
    userId: number,
    payload: {
      diagnosisId?: string;
      skinScore?: Record<string, unknown>;
      weather?: object;
    },
  ): Promise<RecommendationFastResponseDto> {
    // N3: Gemini 전송 동의 — LIVE job이 Gemini를 호출하므로 동일하게 게이트한다.
    await this.consentService.requireActive(
      userId,
      ConsentPurpose.AI_RECOMMENDATION_DATA_TRANSFER,
    );

    const { diagnosisId, skinInput, weatherInput } =
      await this.resolveGenerateInputs(userId, payload);

    // 1) DB LIVE — 완료된 추천이 있으면 가장 정확하고 빠른 결과.
    if (diagnosisId) {
      const existing = await this.repo.findByDiagnosis(userId, diagnosisId);
      if (existing.length > 0) {
        return { source: 'LIVE', recommendations: await this.attachProductIds(existing) };
      }
    }

    // R8: job 재사용 → Redis SWR → 규칙 fallback 순서는 FastPathCoordinator가 정한다.
    // 호환 모드(diagnosisId 없음)는 dedupeKey가 없어 job 재사용 단계를 건너뛴다 —
    // 이 경로의 job payload는 진단 id로 묶이지 않아 같은 대상인지 판별할 수 없다.
    const { source, jobId, generatedAt, items } =
      await this.fastPath.resolve<RecommendationDto>({
        userId,
        jobType: JobType.RECOMMENDATION_GENERATE,
        dedupeKey: diagnosisId ? jobDedupeKeyOf('diagnosisId', diagnosisId) : undefined,
        cacheKey: this.fastCacheKey(userId, diagnosisId, skinInput, weatherInput),
        readJobResult: (result) =>
          (result as { recommendations?: RecommendationDto[] } | null)
            ?.recommendations ?? [],
        loadFallback: async () =>
          buildRuleRecommendations(await this.catalog.load(), skinInput, weatherInput),
        enqueue: () => this.enqueueLiveJob(userId, diagnosisId, skinInput, weatherInput),
        cacheLiveResult: true,
      });

    return { source, jobId, generatedAt, recommendations: items };
  }

  /**
   * 추천 상세 조회.
   * user 비종속(전역 템플릿)이면 누구나 조회 가능.
   * user 종속(생성 추천)이면 소유권 검사를 한다.
   *
   * 전역 템플릿은 RecommendationTemplate 테이블에 있다.
   * 생성 추천은 Recommendation 테이블에 있다.
   * 프론트는 동일한 id로 조회하므로 두 테이블을 순차 조회한다.
   */
  async getById(userId: number | null, id: string): Promise<RecommendationDto> {
    const record = await this.repo.findById(id);
    if (record) {
      // user 종속 추천은 소유권 검사
      if (record.userId !== null && record.userId !== userId) {
        throw new ForbiddenException('해당 추천에 대한 접근 권한이 없습니다');
      }
      // N20: 연결된 관련 제품 id를 함께 반환한다.
      return modelToDto(record, await this.repo.productIdsByRecommendation(record.id));
    }

    const template = await this.repo.findTemplateById(id);
    if (template) {
      const productIds = await this.repo.productIdsByTemplateIds([template.id]);
      return templateToDto(template, productIds.get(template.id) ?? []);
    }

    throw new NotFoundException('추천을 찾을 수 없습니다');
  }

  // ── 생성 경로 헬퍼 ──────────────────────────────

  /**
   * N14: Gemini 호출 전에 동시 요청을 in-flight 예약으로 가른다.
   * 같은 진단의 동시 재시도가 Gemini를 중복 호출하지 않게 하는 핵심 경계다.
   * (진단이 없으면 호환 모드 — 멱등 키가 없으므로 트랜잭션 락에 맡긴다)
   *
   * 이미 완료된 예약이면 동일 결과를 `existing`으로 돌려주고 생성을 건너뛴다.
   */
  private async acquireGenerateReservation(
    userId: number,
    diagnosisId: string | undefined,
  ): Promise<{ scope: string; existing?: RecommendationDto[] } | null> {
    if (!diagnosisId) return null;

    const scope = `recommendation:${diagnosisId}`;
    const reservation = await this.idempotency.acquire(scope, userId);
    if (reservation.outcome === 'in_flight') {
      throw new ConflictException('이미 추천이 생성 중입니다');
    }
    if (reservation.outcome === 'completed') {
      const existing = await this.repo.findByDiagnosis(userId, diagnosisId);
      if (existing.length > 0) {
        return { scope, existing: await this.attachProductIds(existing) };
      }
      // 예약만 남고 결과가 정리된 경우 → 재시도 진행.
      // 다른 요청이 먼저 retake했다면(false) in-flight로 보고 409 (이중 Gemini 방지).
      const retaken = await this.idempotency.retake(scope);
      if (!retaken) {
        throw new ConflictException('이미 추천이 생성 중입니다');
      }
    }
    return { scope };
  }

  /** Gemini 호출 — 실패 시 503 (가짜 추천으로 대체하지 않는다). */
  private async callGemini(
    skinInput: Record<string, unknown>,
    weatherInput: Record<string, unknown>,
  ) {
    try {
      return await this.geminiClient.generateRecommendations(skinInput, weatherInput);
    } catch (e) {
      if (e instanceof GeminiUnavailable) {
        throw new ServiceUnavailableException(
          'AI 추천을 생성할 수 없어요. 잠시 후 다시 시도해주세요.',
        );
      }
      throw e;
    }
  }

  /**
   * N20/N27: 추천마다 성분 기반 관련 제품을 연결한다.
   * 매칭이 0건이면 규칙 기반 실제품을 붙인다 (가상 제품 금지).
   */
  private buildProductLinks(
    rows: GeneratedRecommendationRow[],
    tagsPerRow: string[][],
    catalog: Product[],
  ): RecommendationProductLink[] {
    const links: RecommendationProductLink[] = [];
    const used = new Set<string>();
    rows.forEach((row, i) => {
      const tags = tagsPerRow[i] ?? [];
      const matched = catalog.filter((p) =>
        tags.some((tag) => p.matchedIngredients.includes(tag)),
      );
      const picked =
        matched.length > 0
          ? matched
          : pickMatchlessProducts(
              catalog,
              row.timing,
              used,
              MATCHLESS_FALLBACK_PRODUCT_COUNT,
            );
      picked.forEach((p, order) => {
        links.push({ recommendationId: row.id, productId: p.id, displayOrder: order });
        used.add(p.id);
      });
    });
    return links;
  }

  /**
   * 추천 입력 해석 — diagnosisId(최종 계약) 또는 skinScore+weather(호환)를
   * (diagnosisId, skinInput, weatherInput)으로 정규화한다. 소유권 검사 포함.
   */
  private async resolveGenerateInputs(
    userId: number,
    payload: {
      diagnosisId?: string;
      skinScore?: Record<string, unknown>;
      weather?: object;
    },
  ): Promise<{
    diagnosisId: string | undefined;
    skinInput: Record<string, unknown>;
    weatherInput: Record<string, unknown>;
  }> {
    if (!payload.diagnosisId && (!payload.skinScore || !payload.weather)) {
      throw new BadRequestException(
        'diagnosisId 또는 skinScore와 weather를 함께 보내야 합니다',
      );
    }

    if (payload.diagnosisId) {
      // 최종 계약 — 서버가 diagnosis 소유권 확인 후 DB에서 측정값/날씨를 조회한다.
      const diagnosis = await this.repo.findDiagnosisForInput(payload.diagnosisId);
      if (!diagnosis) {
        throw new NotFoundException('진단을 찾을 수 없습니다');
      }
      if (diagnosis.userId !== userId) {
        throw new ForbiddenException('해당 진단에 대한 접근 권한이 없습니다');
      }

      const skinInput: Record<string, unknown> = {
        id: diagnosis.id,
        capturedAt: diagnosis.capturedAt,
        overallScore: diagnosis.overallScore,
        thumbnailUri: diagnosis.thumbnailUri,
        parts: diagnosis.skinMetrics.map((m) => ({
          part: m.part,
          label: m.label,
          grade: m.grade,
          moisture: m.moisture,
          elasticity: m.elasticity,
          note: m.note,
        })),
      };
      const weatherInput = diagnosis.weatherSnapshot
        ? snapshotToInput(diagnosis.weatherSnapshot)
        : {};
      return { diagnosisId: payload.diagnosisId, skinInput, weatherInput };
    }

    // 호환 — 기존 프론트가 skinScore+weather를 직접 보내는 경우.
    // diagnosisId가 없으면 진단 연결 없이 생성한다 (user에만 연결).
    return {
      diagnosisId: undefined,
      skinInput: payload.skinScore ?? {},
      weatherInput: payload.weather
        ? { ...(payload.weather as Record<string, unknown>) }
        : {},
    };
  }

  // ── 빠른 경로 헬퍼 ──────────────────────────────

  /**
   * FALLBACK/CACHED 응답과 함께 LIVE 교체 job을 enqueue한다. 실패해도 FALLBACK은 반환한다.
   * diagnosisId 모드에서는 payload를 { diagnosisId }만 담아 AsyncJob.payload를 가볍게 유지한다
   * (handler는 진단 모드에서 skinScore/weather를 무시한다).
   */
  private async enqueueLiveJob(
    userId: number,
    diagnosisId: string | undefined,
    skinInput: Record<string, unknown>,
    weatherInput: Record<string, unknown>,
  ): Promise<string | undefined> {
    try {
      const payload = diagnosisId
        ? { diagnosisId }
        : { skinScore: skinInput, weather: weatherInput };
      const { jobId } = await this.jobService.enqueue(
        userId,
        JobType.RECOMMENDATION_GENERATE,
        payload,
      );
      return jobId;
    } catch (e) {
      this.logger.warn(
        `Fast path: LIVE job enqueue failed (userId=${userId}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return undefined;
    }
  }

  /** Redis SWR 캐시 키 — diagnosisId가 있으면 진단 키, 없으면 (스냅샷+날씨) 지문 키. */
  private fastCacheKey(
    userId: number,
    diagnosisId: string | undefined,
    skinInput: Record<string, unknown>,
    weatherInput: Record<string, unknown>,
  ): string {
    if (diagnosisId) return this.diagnosisCacheKey(userId, diagnosisId);
    const fingerprint = createHash('sha1')
      .update(JSON.stringify({ skinInput, weatherInput }))
      .digest('hex')
      .slice(0, 16);
    return `rec:fast:${userId}:compat:${fingerprint}`;
  }

  private diagnosisCacheKey(userId: number, diagnosisId: string): string {
    return `rec:fast:${userId}:${diagnosisId}`;
  }

  /**
   * N20: 생성 추천 목록에 관련 제품 id를 일괄 조회해 붙인다.
   * (existing 재반환·completed 재반환·방금 생성한 추천 공용)
   */
  private async attachProductIds(
    recs: RecommendationModel[],
  ): Promise<RecommendationDto[]> {
    const byId = await this.repo.productIdsByRecommendationIds(recs.map((r) => r.id));
    return recs.map((r) => modelToDto(r, byId.get(r.id) ?? []));
  }
}
