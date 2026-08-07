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
import { GeminiClient, GeminiUnavailable } from '../gemini/gemini.client';
import { ConsentService } from '../consent/consent.service';
import { ConsentPurpose } from '../consent/enums/consent-purpose.enum';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { EvidenceGrade } from './enums/evidence-grade.enum';
import { RecommendationDto, RecommendationTiming } from './dto/recommendation.dto';
import {
  RecommendationTemplate,
  Recommendation as RecommendationModel,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
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
 * RecommendationService — 전역 추천 템플릿 목록, B등급 생성, 상세 조회.
 *
 * 설계 기준 (BACKEND_TASKS.md T7/T8):
 * - 전역 A등급 템플릿과 사용자별 생성 추천을 분리한다.
 * - grade/sourceLabel은 서버가 고정하고 LLM이 결정하지 않는다.
 * - 추천 생성은 diagnosisId 중심(최종 계약)을 지원하되, 기존 프론트의
 *   skinScore+weather 직접 전송도 호환한다(contract migration 전까지).
 * - 동일 진단에 대한 중복 생성을 방지한다.
 * - 추천 상세 조회 시 사용자 소유권을 검사한다.
 * - Gemini 실패 시 503을 반환하고 가짜 추천으로 대체하지 않는다.
 */
@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiClient: GeminiClient,
    private readonly consentService: ConsentService,
    private readonly idempotency: IdempotencyService,
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
   */
  async generate(
    userId: number,
    payload: {
      diagnosisId?: string;
      skinScore?: Record<string, unknown>;
      weather?: object;
    },
  ): Promise<RecommendationDto[]> {
    if (!payload.diagnosisId && (!payload.skinScore || !payload.weather)) {
      throw new BadRequestException(
        'diagnosisId 또는 skinScore와 weather를 함께 보내야 합니다',
      );
    }

    // N3: Gemini 등 외부 AI로 피부/날씨 데이터를 보내려면 전송 동의 필수.
    await this.consentService.requireActive(
      userId,
      ConsentPurpose.AI_RECOMMENDATION_DATA_TRANSFER,
    );

    let skinInput: Record<string, unknown>;
    let weatherInput: Record<string, unknown>;
    let diagnosisId: string | undefined = payload.diagnosisId;

    if (diagnosisId) {
      // 최종 계약 — 서버가 diagnosis 소유권 확인 후 DB에서 측정값/날씨를 조회한다.
      const diagnosis = await this.prisma.diagnosis.findFirst({
        where: notDeletedWhere({ id: diagnosisId }),
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

      skinInput = {
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
      weatherInput = diagnosis.weatherSnapshot
        ? this.snapshotToInput(diagnosis.weatherSnapshot)
        : {};
    } else {
      // 호환 — 기존 프론트가 skinScore+weather를 직접 보내는 경우.
      // diagnosisId가 없으면 진단 연결 없이 생성한다 (user에만 연결).
      skinInput = payload.skinScore ?? {};
      weatherInput = payload.weather
        ? { ...(payload.weather as Record<string, unknown>) }
        : {};
    }

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

        // N20: 생성된 추천마다 성분 기반 관련 제품을 연결한다.
        const links: {
          recommendationId: string;
          productId: string;
          displayOrder: number;
        }[] = [];
        data.forEach((row, i) => {
          const tags = items[i]?.ingredientTags ?? [];
          const matched = catalog
            .filter((p) => tags.some((tag) => p.matchedIngredients.includes(tag)))
            .map((p) => p.id);
          matched.forEach((pid, order) =>
            links.push({ recommendationId: row.id, productId: pid, displayOrder: order }),
          );
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
      return this.attachProductIds(persisted as RecommendationModel[]);
    } catch (e) {
      // N14: 실패(503/저장 오류) 시 예약을 해제해 재시도가 가능하게 한다.
      if (reservationScope) {
        await this.idempotency.release(reservationScope);
      }
      throw e;
    }
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
}
