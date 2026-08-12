import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Product,
  RecommendationTemplate,
  Recommendation as RecommendationModel,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { notDeletedWhere } from '../../common/soft-delete/soft-delete.policy';
import { EvidenceGrade } from './enums/evidence-grade.enum';
import { RecommendationTiming } from './dto/recommendation.dto';

/**
 * R7: 추천 도메인의 모든 DB 접근.
 *
 * "이 진단의 추천 가져오기" 쿼리가 서비스 안에 네 번 복붙돼 있었다. 정렬이나
 * `deletedAt` 조건을 한 곳에서만 빠뜨려도 조용히 어긋나므로 쿼리를 여기로 모은다.
 * 트랜잭션 경계(advisory lock)도 여기 하나에만 있다 — 락 범위가 호출처마다 달라지면
 * 동시성 버그가 생긴다.
 */

/** createMany에 넣을, 서버가 이미 확정한 추천 row. */
export interface GeneratedRecommendationRow {
  id: string;
  userId: number;
  diagnosisId: string | null;
  title: string;
  grade: EvidenceGrade;
  sourceLabel: string;
  explanation: string;
  observationalNote: string | null;
  ingredientTags: string[];
  timing: RecommendationTiming | null;
}

export interface RecommendationProductLink {
  recommendationId: string;
  productId: string;
  displayOrder: number;
}

@Injectable()
export class RecommendationRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── 전역 템플릿 ────────────────────────────────

  findTemplates(args: {
    where: Prisma.RecommendationTemplateWhereInput;
    take?: number;
  }): Promise<RecommendationTemplate[]> {
    return this.prisma.recommendationTemplate.findMany({
      where: args.where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: args.take,
    });
  }

  findTemplateById(id: string): Promise<RecommendationTemplate | null> {
    return this.prisma.recommendationTemplate.findUnique({ where: { id } });
  }

  // ── 생성 추천 ──────────────────────────────────

  /** 같은 진단의 기존 추천 (최신순). 중복 생성 방지·재반환 경로가 모두 이걸 쓴다. */
  findByDiagnosis(
    userId: number,
    diagnosisId: string,
  ): Promise<RecommendationModel[]> {
    return this.prisma.recommendation.findMany({
      where: { diagnosisId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<RecommendationModel | null> {
    return this.prisma.recommendation.findUnique({ where: { id } });
  }

  /**
   * 같은 진단에 대한 동시 요청을 advisory lock으로 직렬화하고 추천 + 제품 연결을
   * 한 트랜잭션에 저장한다. 락은 트랜잭션 종료 시 자동 해제되므로 unlock 누락이 없다.
   *
   * 첫 조회와 Gemini 호출 사이에 다른 요청이 저장했을 수 있으므로 락 획득 후 반드시
   * 다시 확인한다 — 이미 있으면 저장하지 않고 그 결과를 돌려준다.
   */
  async createGenerated(params: {
    userId: number;
    diagnosisId: string | null;
    rows: GeneratedRecommendationRow[];
    links: RecommendationProductLink[];
    createdAt: Date;
  }): Promise<RecommendationModel[]> {
    const { userId, diagnosisId, rows, links, createdAt } = params;
    const lockKey = `todayskin:recommendation:${diagnosisId ?? `user:${userId}`}`;

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      if (diagnosisId) {
        const existing = await tx.recommendation.findMany({
          where: { diagnosisId, userId },
          orderBy: { createdAt: 'desc' },
        });
        if (existing.length > 0) return existing;
      }

      await tx.recommendation.createMany({ data: rows });
      if (links.length > 0) {
        await tx.recommendationProduct.createMany({ data: links });
      }

      // 응답에 필요한 값은 모두 서버가 만든 rows에 있으므로 저장 직후 같은 row를
      // 다시 조회하는 round-trip을 만들지 않는다.
      return rows.map((row) => ({ ...row, createdAt })) as RecommendationModel[];
    });
  }

  // ── 관련 제품 연결 (N20) ────────────────────────

  /** 추천 id 목록 → 관련 제품 id (N+1 방지 일괄 조회, displayOrder 순). */
  async productIdsByRecommendationIds(
    recommendationIds: string[],
  ): Promise<Map<string, string[]>> {
    if (recommendationIds.length === 0) return new Map();
    const links = await this.prisma.recommendationProduct.findMany({
      where: { recommendationId: { in: recommendationIds } },
      select: { recommendationId: true, productId: true },
      orderBy: { displayOrder: 'asc' },
    });
    return groupProductIds(links.map((l) => [l.recommendationId, l.productId]));
  }

  /** 템플릿 id 목록 → 관련 제품 id (N+1 방지 일괄 조회, displayOrder 순). */
  async productIdsByTemplateIds(
    templateIds: string[],
  ): Promise<Map<string, string[]>> {
    if (templateIds.length === 0) return new Map();
    const links = await this.prisma.recommendationProduct.findMany({
      where: { templateId: { in: templateIds } },
      select: { templateId: true, productId: true },
      orderBy: { displayOrder: 'asc' },
    });
    return groupProductIds(links.map((l) => [l.templateId, l.productId]));
  }

  async productIdsByRecommendation(recommendationId: string): Promise<string[]> {
    const links = await this.prisma.recommendationProduct.findMany({
      where: { recommendationId },
      select: { productId: true },
      orderBy: { displayOrder: 'asc' },
    });
    return links.map((l) => l.productId);
  }

  // ── 입력 해석에 필요한 조회 ──────────────────────

  /** 제품 카탈로그 전체 (성분 매칭·규칙 fallback용). */
  loadCatalog(): Promise<Product[]> {
    return this.prisma.product.findMany();
  }

  /** 추천 입력 해석용 진단 — 소유권 검사는 호출처가 한다. */
  findDiagnosisForInput(diagnosisId: string) {
    return this.prisma.diagnosis.findFirst({
      where: notDeletedWhere({ id: diagnosisId }),
      include: { skinMetrics: true, weatherSnapshot: true },
    });
  }
}

function groupProductIds(
  pairs: Array<[string | null, string]>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [key, productId] of pairs) {
    if (!key) continue;
    const arr = map.get(key) ?? [];
    arr.push(productId);
    map.set(key, arr);
  }
  return map;
}
