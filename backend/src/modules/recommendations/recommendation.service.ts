import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { GeminiClient, GeminiUnavailable } from '../gemini/gemini.client';
import { ConsentService } from '../consent/consent.service';
import { ConsentPurpose } from '../consent/enums/consent-purpose.enum';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { JobService } from '../jobs/job.service';
import { JobStateService } from '../jobs/job-state.service';
import { jobDedupeKeyOf } from '../jobs/job-dedupe';
import { JobType } from '../jobs/enums/job-type.enum';
import { JobStatus } from '../jobs/enums/job-status.enum';
import { EvidenceGrade } from './enums/evidence-grade.enum';
import { RecommendationDto, RecommendationTiming } from './dto/recommendation.dto';
import { RecommendationFastResponseDto } from './dto/recommendation-fast-response.dto';
import { ProductCategory } from '../products/enums/product-category.enum';
import {
  Product,
  RecommendationTemplate,
  Recommendation as RecommendationModel,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  buildCursorPage,
  CursorPageDto,
  decodeCursor,
} from '../../common/pagination/cursor-pagination';
import { notDeletedWhere } from '../../common/soft-delete/soft-delete.policy';

/**
 * LLM이 만들어내지 않는, 서버가 통제하는 정직한 출처 표기 (허위 인용 방지).
 * B등급(사진+날씨 매칭) 추천 생성에 고정한다.
 */
const B_GRADE_SOURCE_LABEL = 'AI 종합 분석 · 피부과학 일반 지식 기반';

/**
 * N32 rec-fast-path: 규칙 기반 빠른 응답(FALLBACK)의 정직한 출처 표기.
 * AI가 만든 결과가 아님을 명시해 LIVE 교체 전까지 오해를 막는다.
 */
const FALLBACK_SOURCE_LABEL = '규칙 기반 빠른 응답 · AI 분석 전';

/** N32: Redis SWR 캐시 TTL(초). */
const REC_FAST_CACHE_TTL_S = 6 * 60 * 60;

/** N32: CACHED 항목이 이 시간보다 오래되면 재검증(LIVE) job을 enqueue한다(SWR). */
const REC_FAST_REVALIDATE_MS = 30 * 60 * 1000;

/** N32: 중복 enqueue 방지 job 조회 창 — 이 시간 안의 PENDING/COMPLETED/FAILED job을 재사용 후보로 본다. */
const FAST_JOB_DEDUP_WINDOW_MS = 10 * 60 * 1000;

/** N32: FAILED job이 이 시간 안이면 재사용(FALLBACK + 같은 jobId)하고, 지나면 새 job을 enqueue한다. */
const FAST_FAILED_COOLDOWN_MS = 5 * 60 * 1000;

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
 */
@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiClient: GeminiClient,
    private readonly consentService: ConsentService,
    private readonly idempotency: IdempotencyService,
    private readonly redis: RedisService,
    private readonly jobService: JobService,
    private readonly jobState: JobStateService,
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
    const where: Record<string, unknown> = {};
    if (grade) where.grade = grade;
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
    const templates = await this.prisma.recommendationTemplate.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: take ? take + 1 : undefined,
    });
    // N20: 관련 제품 id를 일괄 조회해 N+1 없이 채운다.
    const productIdsByTemplate = await this.fetchProductIdsByTemplate(
      templates.map((t) => t.id),
    );
    const items = templates.map((row) =>
      this.templateToDto(row, productIdsByTemplate.get(row.id) ?? []),
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
      const existing = await this.prisma.recommendation.findMany({
        where: { diagnosisId, userId },
        orderBy: { createdAt: 'desc' },
      });
      if (existing.length > 0) {
        this.logger.debug(`Recommendations already exist for diagnosis ${diagnosisId}, returning existing`);
        return this.attachProductIds(existing);
      }
    }

    // N14: Gemini 호출 전에 동시 요청을 in-flight 예약으로 가른다.
    // 같은 진단의 동시 재시도가 Gemini를 중복 호출하지 않게 하는 핵심 경계다.
    // (진단이 없으면 호환 모드 — 멱등 키가 없으므로 기존 transaction lock에 맡긴다)
    let reservationScope: string | null = null;
    if (diagnosisId) {
      const reservation = await this.idempotency.acquire(
        `recommendation:${diagnosisId}`,
        userId,
      );
      if (reservation.outcome === 'in_flight') {
        throw new ConflictException('이미 추천이 생성 중입니다');
      }
      if (reservation.outcome === 'completed') {
        // 이전 요청이 완료한 예약 — 동일 결과를 재반환한다.
        const existing = await this.prisma.recommendation.findMany({
          where: { diagnosisId, userId },
          orderBy: { createdAt: 'desc' },
        });
        if (existing.length > 0) {
          return this.attachProductIds(existing);
        }
        // 예약만 남고 결과가 정리된 경우 → 재시도 진행.
        // 다른 요청이 먼저 retake했다면(false) in-flight로 보고 409 (이중 Gemini 방지).
        const retaken = await this.idempotency.retake(`recommendation:${diagnosisId}`);
        if (!retaken) {
          throw new ConflictException('이미 추천이 생성 중입니다');
        }
      }
      reservationScope = `recommendation:${diagnosisId}`;
    }

    try {
      // Gemini 호출 — 실패 시 503 (가짜 추천으로 대체하지 않음).
      let items;
      try {
        items = await this.geminiClient.generateRecommendations(skinInput, weatherInput);
      } catch (e) {
        if (e instanceof GeminiUnavailable) {
          throw new ServiceUnavailableException(
            'AI 추천을 생성할 수 없어요. 잠시 후 다시 시도해주세요.',
          );
        }
        throw e;
      }

      // 서버가 grade=B, sourceLabel을 고정한다. 모든 row를 먼저 구성한 뒤
      // 하나의 transaction에서 일괄 저장한다. 기존 구현처럼 item별 create를
      // 순차 실행하면 중간 DB 오류 때 추천이 일부만 남을 수 있다.
      const createdAt = new Date();
      const data = items.map((item) => {
        const id = `gemini-${this.shortId()}`;
        const timing = (item.timing as RecommendationTiming | null) ?? null;
        return {
          id,
          userId,
          diagnosisId: diagnosisId ?? null,
          title: item.title,
          grade: EvidenceGrade.B,
          sourceLabel: B_GRADE_SOURCE_LABEL,
          explanation: item.explanation,
          observationalNote: null,
          ingredientTags: item.ingredientTags,
          timing,
        };
      });

      // N20: 관련 제품 매칭용 카탈로그 — 추천의 성분 태그와 제품의
      // matchedIngredients 교집합으로 연결한다. (제품 수가 적어 메모리 매칭)
      // 제품 카탈로그는 seed/관리자만 수정하는 정적 데이터이므로 transaction 밖
      // 조회와 저장 사이에 제품이 추가되는 경쟁은 무시할 만하다.
      const catalog = await this.prisma.product.findMany();

      const persisted = await this.prisma.$transaction(async (tx) => {
        // 같은 진단에 대한 동시 요청은 DB advisory lock으로 직렬화한다.
        // lock은 transaction 종료 시 자동 해제되므로 별도 unlock 누락이 없다.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`todayskin:recommendation:${diagnosisId ?? `user:${userId}`}`}))`;

        // 첫 조회와 Gemini 호출 사이에 다른 요청이 저장했을 수 있으므로
        // lock을 획득한 뒤 반드시 다시 확인한다.
        if (diagnosisId) {
          const existing = await tx.recommendation.findMany({
            where: { diagnosisId, userId },
            orderBy: { createdAt: 'desc' },
          });
          if (existing.length > 0) return existing;
        }

        await tx.recommendation.createMany({ data });

        // N20/N27: 생성된 추천마다 성분 기반 관련 제품을 연결한다.
        // 매칭 0건이면 규칙 기반 실제품 fallback을 연결한다 (가상 제품 금지).
        const links: {
          recommendationId: string;
          productId: string;
          displayOrder: number;
        }[] = [];
        const usedProductIds = new Set<string>();
        data.forEach((row, i) => {
          const tags = items[i]?.ingredientTags ?? [];
          const matched = catalog
            .filter((p) => tags.some((tag) => p.matchedIngredients.includes(tag)))
            .map((p) => p.id);
          matched.forEach((pid, order) => {
            links.push({ recommendationId: row.id, productId: pid, displayOrder: order });
            usedProductIds.add(pid);
          });
          if (matched.length === 0) {
            // N27: 매칭 0건 → 규칙 기반 실제품 fallback (최대 2개, 등급 A 우선 + timing 카테고리)
            const fallback = this.pickFallbackProducts(
              catalog,
              row.timing,
              usedProductIds,
              2,
            );
            fallback.forEach((p, order) => {
              links.push({ recommendationId: row.id, productId: p.id, displayOrder: order });
              usedProductIds.add(p.id);
            });
          }
        });
        if (links.length > 0) {
          await tx.recommendationProduct.createMany({ data: links });
        }

        // 응답에 필요한 값은 모두 서버가 생성한 data에 있으므로 저장 직후
        // 같은 row를 다시 조회하는 불필요한 DB round-trip을 만들지 않는다.
        return data.map((row) => ({ ...row, createdAt }));
      });

      // N14: 성공 시 예약을 COMPLETED로 전환 — 이후 재시도는 동일 결과를 재반환받는다.
      if (reservationScope) {
        await this.idempotency.complete(reservationScope);
      }

      // 방금 저장한 추천들에도 관련 제품 id를 채운다.
      const dtos = await this.attachProductIds(persisted as RecommendationModel[]);

      // N32: LIVE 생성 결과를 Redis SWR에 캐시한다 — 다음 빠른 경로가 source: CACHED.
      if (diagnosisId) {
        await this.cacheFastRecommendations(userId, diagnosisId, dtos);
      }

      return dtos;
    } catch (e) {
      // N14: 실패(503/저장 오류) 시 예약을 해제해 재시도가 가능하게 한다.
      if (reservationScope) {
        await this.idempotency.release(reservationScope);
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
      const existing = await this.prisma.recommendation.findMany({
        where: { diagnosisId, userId },
        orderBy: { createdAt: 'desc' },
      });
      if (existing.length > 0) {
        return {
          source: 'LIVE',
          recommendations: await this.attachProductIds(existing),
        };
      }

      // 2) job dedup — 같은 진단의 진행 중/완료/최근 실패 job을 재사용한다.
      //    (FAILED도 cooldown 안이면 같은 jobId로 재사용해 job 스팸을 막는다 — N32)
      const job = await this.findRecentJob(userId, 'diagnosisId', diagnosisId);
      if (job) {
        if (job.status === JobStatus.COMPLETED) {
          const result = job.result as { recommendations?: RecommendationDto[] } | null;
          const recs = result?.recommendations ?? [];
          if (recs.length > 0) {
            await this.cacheFastRecommendations(userId, diagnosisId, recs);
            return {
              source: 'LIVE',
              jobId: job.id,
              generatedAt: job.finishedAt?.toISOString(),
              recommendations: recs,
            };
          }
        } else if (this.isRecentlyFailed(job)) {
          // Gemini 실패 직후 — 같은 jobId(FE가 FAILED를 볼 수 있게) + FALLBACK 유지.
          return {
            source: 'FALLBACK',
            jobId: job.id,
            recommendations: await this.buildRuleRecommendations(
              skinInput,
              weatherInput,
            ),
          };
        } else if (job.status === JobStatus.PENDING) {
          // PENDING — 같은 job을 그대로 알려주고 규칙 FALLBACK을 먼저 보여준다.
          return {
            source: 'FALLBACK',
            jobId: job.id,
            recommendations: await this.buildRuleRecommendations(
              skinInput,
              weatherInput,
            ),
          };
        }
        // FAILED가 cooldown을 지났으면 아래로 내려가 새 job을 enqueue한다.
      }
    }

    // 3) Redis SWR hit → CACHED.
    const cacheKey = this.fastCacheKey(userId, diagnosisId, skinInput, weatherInput);
    const cached = await this.readFastCache(cacheKey);
    if (cached) {
      const stale =
        Date.now() - new Date(cached.generatedAt).getTime() >
        REC_FAST_REVALIDATE_MS;
      let jobId: string | undefined;
      if (stale) {
        // SWR: 낡은 데이터를 먼저 보여주고, 뒤에서 LIVE로 재검증한다.
        jobId = await this.enqueueLiveJob(userId, diagnosisId, skinInput, weatherInput);
      }
      return {
        source: 'CACHED',
        jobId,
        generatedAt: cached.generatedAt,
        recommendations: cached.recommendations,
      };
    }

    // 4) miss → 규칙 기반 실제품 FALLBACK 즉시 반환 + LIVE job enqueue.
    const fallback = await this.buildRuleRecommendations(skinInput, weatherInput);
    const jobId = await this.enqueueLiveJob(
      userId,
      diagnosisId,
      skinInput,
      weatherInput,
    );
    return { source: 'FALLBACK', jobId, recommendations: fallback };
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
    // 1. 생성 추천(Recommendation) 조회
    const record = await this.prisma.recommendation.findUnique({
      where: { id },
    });
    if (record) {
      // user 종속 추천은 소유권 검사
      if (record.userId !== null && record.userId !== userId) {
        throw new ForbiddenException('해당 추천에 대한 접근 권한이 없습니다');
      }
      // N20: 연결된 관련 제품 id를 함께 반환한다.
      const productIds = await this.fetchProductIdsByRecommendation(record.id);
      return this.modelToDto(record, productIds);
    }

    // 2. 전역 템플릿(RecommendationTemplate) 조회
    const template = await this.prisma.recommendationTemplate.findUnique({
      where: { id },
    });
    if (template) {
      const productIds = await this.fetchProductIdsByTemplate([template.id]);
      return this.templateToDto(template, productIds.get(template.id) ?? []);
    }

    throw new NotFoundException('추천을 찾을 수 없습니다');
  }

  // ── N32 빠른 경로 헬퍼 ──────────────────────────────

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
      const diagnosis = await this.prisma.diagnosis.findFirst({
        where: notDeletedWhere({ id: payload.diagnosisId }),
        include: {
          skinMetrics: true,
          weatherSnapshot: true,
        },
      });
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
        ? this.snapshotToInput(diagnosis.weatherSnapshot)
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

  /**
   * 같은 dedupe 키를 가진 최근 job 조회 (중복 enqueue 방지).
   * R10: payload JSON 경로 비교 → `dedupeKey` 컬럼 조회로 바꿔 인덱스를 타게 했다.
   */
  private async findRecentJob(userId: number, payloadKey: string, value: string) {
    return this.jobState.findRecentByDedupeKey({
      userId,
      type: JobType.RECOMMENDATION_GENERATE,
      dedupeKey: jobDedupeKeyOf(payloadKey, value),
      withinMs: FAST_JOB_DEDUP_WINDOW_MS,
    });
  }

  /** FAILED가 cooldown 안이면 같은 jobId를 재사용한다 (job 스팸 방지). */
  private isRecentlyFailed(job: { status: string; finishedAt: Date | null }): boolean {
    return (
      job.status === JobStatus.FAILED &&
      !!job.finishedAt &&
      Date.now() - job.finishedAt.getTime() < FAST_FAILED_COOLDOWN_MS
    );
  }

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
    if (diagnosisId) return `rec:fast:${userId}:${diagnosisId}`;
    const fingerprint = createHash('sha1')
      .update(JSON.stringify({ skinInput, weatherInput }))
      .digest('hex')
      .slice(0, 16);
    return `rec:fast:${userId}:compat:${fingerprint}`;
  }

  private async readFastCache(
    key: string,
  ): Promise<{ recommendations: RecommendationDto[]; generatedAt: string } | null> {
    return this.redis.getJson<{
      recommendations: RecommendationDto[];
      generatedAt: string;
    }>(key);
  }

  /** LIVE 생성 결과를 Redis SWR에 저장 (진단 모드). Redis 장애 시 조용히 실패. */
  private async cacheFastRecommendations(
    userId: number,
    diagnosisId: string,
    recommendations: RecommendationDto[],
  ): Promise<void> {
    const key = `rec:fast:${userId}:${diagnosisId}`;
    await this.redis.setJson(
      key,
      { recommendations, generatedAt: new Date().toISOString() },
      REC_FAST_CACHE_TTL_S,
    );
  }

  /**
   * N32: 규칙 기반 빠른 추천 (FALLBACK) — 실제 카탈로그 제품만 연결한다.
   * 가상 제품·가상 인용을 만들지 않는 정직한 자리표시자다. AI 상세 분석(LIVE)이
   * 완료되면 job 결과로 교체된다. 등급은 B로 표기하되 sourceLabel로 AI가 아님을 명시한다.
   */
  private async buildRuleRecommendations(
    skinInput: Record<string, unknown>,
    weatherInput: Record<string, unknown>,
  ): Promise<RecommendationDto[]> {
    const catalog = await this.prisma.product.findMany();
    const used = new Set<string>();
    const slots: Array<{
      timing: RecommendationTiming;
      prefs: ProductCategory[];
      title: string;
      body: string;
    }> = [
      {
        timing: '외출 후',
        prefs: [ProductCategory.BARRIER, ProductCategory.MOISTURE],
        title: '외출 후 진정·세안 루틴',
        body: '외출 후 세안과 진정 케어가 오늘 환경 노출 관리에 도움될 수 있어요.',
      },
      {
        timing: '자기 전',
        prefs: [ProductCategory.MOISTURE, ProductCategory.BARRIER],
        title: '자기 전 보습·배리어 루틴',
        body: '자기 전 보습과 피부장벽 관리가 피부 상태 유지에 도움될 수 있어요.',
      },
      {
        timing: '언제든',
        prefs: [ProductCategory.MOISTURE, ProductCategory.BRIGHTENING],
        title: '언제든 수분 유지 루틴',
        body: '하루 중 수분 보충이 건조함 완화에 도움될 수 있어요.',
      },
    ];

    const overallScore =
      typeof skinInput.overallScore === 'number'
        ? skinInput.overallScore
        : null;
    return slots.map((slot) => {
      const picked = this.pickRuleRecommendationProducts(
        catalog,
        slot.prefs,
        used,
        2,
      );
      picked.forEach((p) => used.add(p.id));
      const ingredientTags = [
        ...new Set(picked.flatMap((p) => p.matchedIngredients)),
      ];
      const weatherPhrase = this.ruleWeatherPhrase(weatherInput);
      const scorePhrase =
        overallScore !== null
          ? ` 측정 점수 ${Math.round(overallScore)}점을 기준으로`
          : '';
      return {
        id: `fast-${this.shortId()}`,
        title: slot.title,
        grade: EvidenceGrade.B,
        sourceLabel: FALLBACK_SOURCE_LABEL,
        explanation: `${slot.body}${scorePhrase} 오늘 날씨(${weatherPhrase})를 고려해 고른 실제 제품이에요. AI 상세 분석이 완료되면 LIVE 결과로 교체돼요.`,
        // N32: FALLBACK은 관측 통계가 아니므로 observationalNote는 비운다.
        observationalNote: null,
        ingredientTags,
        relatedProductIds: picked.map((p) => p.id),
        timing: slot.timing,
      };
    });
  }

  /** 규칙 fallback 문구용 날씨 요약 — 존재하는 수치만 언급한다. */
  private ruleWeatherPhrase(weather: Record<string, unknown>): string {
    const parts: string[] = [];
    if (typeof weather.uvIndex === 'number') {
      parts.push(`자외선지수 ${weather.uvIndex}`);
    }
    if (typeof weather.pm25 === 'number') {
      parts.push(`미세먼지 ${weather.pm25}`);
    }
    if (typeof weather.pm10 === 'number') {
      parts.push(`초미세먼지 ${weather.pm10}`);
    }
    return parts.length > 0 ? parts.join(', ') : '자외선·대기질 측정 불가';
  }

  // ── 매핑 헬퍼 ──────────────────────────────────

  /**
   * N20: 생성 추천 목록에 관련 제품 id를 일괄 조회해 붙인다.
   * (existing 재반환·completed 재반환·방금 생성한 추천 공용)
   */
  private async attachProductIds(
    recs: RecommendationModel[],
  ): Promise<RecommendationDto[]> {
    const ids = recs.map((r) => r.id);
    const links = ids.length
      ? await this.prisma.recommendationProduct.findMany({
          where: { recommendationId: { in: ids } },
          select: { recommendationId: true, productId: true },
          orderBy: { displayOrder: 'asc' },
        })
      : [];
    const byId = new Map<string, string[]>();
    for (const l of links) {
      if (!l.recommendationId) continue;
      const arr = byId.get(l.recommendationId) ?? [];
      arr.push(l.productId);
      byId.set(l.recommendationId, arr);
    }
    return recs.map((r) => this.modelToDto(r, byId.get(r.id) ?? []));
  }

  /** N20: 템플릿 id 목록별 관련 제품 id Map (N+1 방지 일괄 조회). */
  private async fetchProductIdsByTemplate(
    templateIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (templateIds.length === 0) return map;
    const links = await this.prisma.recommendationProduct.findMany({
      where: { templateId: { in: templateIds } },
      select: { templateId: true, productId: true },
      orderBy: { displayOrder: 'asc' },
    });
    for (const l of links) {
      if (!l.templateId) continue;
      const arr = map.get(l.templateId) ?? [];
      arr.push(l.productId);
      map.set(l.templateId, arr);
    }
    return map;
  }

  /** N20: 생성 추천 1건의 관련 제품 id 목록. */
  private async fetchProductIdsByRecommendation(
    recommendationId: string,
  ): Promise<string[]> {
    const links = await this.prisma.recommendationProduct.findMany({
      where: { recommendationId },
      select: { productId: true },
      orderBy: { displayOrder: 'asc' },
    });
    return links.map((l) => l.productId);
  }

  private templateToDto(
    t: RecommendationTemplate,
    relatedProductIds: string[] = [],
  ): RecommendationDto {
    return {
      id: t.id,
      title: t.title,
      grade: t.grade as EvidenceGrade,
      sourceLabel: t.sourceLabel,
      explanation: t.explanation,
      observationalNote: t.observationalNote,
      ingredientTags: t.ingredientTags,
      relatedProductIds,
      timing: (t.timing as RecommendationTiming | null) ?? null,
    };
  }

  private modelToDto(
    r: RecommendationModel,
    relatedProductIds: string[] = [],
  ): RecommendationDto {
    return {
      id: r.id,
      title: r.title,
      grade: r.grade as EvidenceGrade,
      sourceLabel: r.sourceLabel,
      explanation: r.explanation,
      observationalNote: r.observationalNote,
      ingredientTags: r.ingredientTags,
      relatedProductIds,
      timing: (r.timing as RecommendationTiming | null) ?? null,
    };
  }

  /**
   * WeatherSnapshot Prisma 모델을 Gemini 입력용 plain 객체로 변환.
   */
  private snapshotToInput(s: {
    observedAt: Date;
    regionName: string;
    uvIndex: number | null;
    uvStatus: string | null;
    uvIndexPeak: number | null;
    uvStatusPeak: string | null;
    uvIndexPeakHour: number | null;
    ozonePpm: number | null;
    ozoneStatus: string | null;
    pm25: number | null;
    pm25Status: string | null;
    pm10: number | null;
    pm10Status: string | null;
    caiValue: number | null;
    caiStatus: string | null;
    no2Value: number | null;
    so2Value: number | null;
    coValue: number | null;
  }): Record<string, unknown> {
    return {
      observedAt: s.observedAt,
      regionName: s.regionName,
      uvIndex: s.uvIndex,
      uvStatus: s.uvStatus,
      uvIndexPeak: s.uvIndexPeak,
      uvStatusPeak: s.uvStatusPeak,
      uvIndexPeakHour: s.uvIndexPeakHour,
      ozonePpm: s.ozonePpm,
      ozoneStatus: s.ozoneStatus,
      pm25: s.pm25,
      pm25Status: s.pm25Status,
      pm10: s.pm10,
      pm10Status: s.pm10Status,
      caiValue: s.caiValue,
      caiStatus: s.caiStatus,
      no2Value: s.no2Value,
      so2Value: s.so2Value,
      coValue: s.coValue,
    };
  }

  private shortId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 20);
  }

  /**
   * N27: 성분 매칭 0건일 때 쓰는 규칙 기반 실제품 fallback.
   * 등급 A 우선, timing별 카테고리 우선순위 순으로 결정적으로 골라 최대 count개를 반환한다.
   * 카탈로그에 실제 존재하는 제품만 고른다 (가상 제품 생성 금지).
   */
  private pickFallbackProducts(
    catalog: Product[],
    timing: string | null,
    used: Set<string>,
    count: number,
  ): Product[] {
    // 추천 timing('외출 후'|'자기 전'|'언제든') 기준 카테고리 우선순위.
    const categoryPref =
      timing === '외출 후'
        ? ['barrier', 'moisture']
        : ['moisture', 'barrier', 'brightening', 'elasticity'];
    return this.pickRuleRecommendationProducts(catalog, categoryPref, used, count);
  }

  /**
   * N27/N32 공용: 규칙 기반 실제품 선택 — 등급 A 우선 + 카테고리 우선순위로
   * 결정적으로 골라 최대 count개를 반환한다.
   */
  private pickRuleRecommendationProducts(
    catalog: Product[],
    categoryPref: string[],
    used: Set<string>,
    count: number,
  ): Product[] {
    const available = catalog.filter((p) => !used.has(p.id));
    const ranked = [...available].sort((a, b) => {
      const gradeDiff =
        (a.matchedGrade === EvidenceGrade.A ? 0 : 1) -
        (b.matchedGrade === EvidenceGrade.A ? 0 : 1);
      if (gradeDiff !== 0) return gradeDiff;
      const catA = categoryPref.indexOf(a.category);
      const catB = categoryPref.indexOf(b.category);
      return (catA === -1 ? 99 : catA) - (catB === -1 ? 99 : catB);
    });
    return ranked.slice(0, count);
  }
}
