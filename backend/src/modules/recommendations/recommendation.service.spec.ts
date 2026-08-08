import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { GeminiClient, GeminiUnavailable } from '../gemini/gemini.client';
import { ConsentService } from '../consent/consent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { EvidenceGrade } from './enums/evidence-grade.enum';
import { RecommendationDto } from './dto/recommendation.dto';

/**
 * RecommendationService 단위 테스트.
 * Prisma와 GeminiClient를 mock하여 비즈니스 로직(전역 목록, 생성, 중복 방지, 소유권)을 검증.
 */
describe('RecommendationService', () => {
  let service: RecommendationService;
  let geminiClient: { generateRecommendations: jest.Mock };
  let consentService: { requireActive: jest.Mock };
  let idempotency: {
    acquire: jest.Mock;
    complete: jest.Mock;
    release: jest.Mock;
    retake: jest.Mock;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;

  beforeEach(async () => {
    geminiClient = {
      generateRecommendations: jest.fn(),
    };
    consentService = {
      requireActive: jest.fn().mockResolvedValue(undefined),
    };
    idempotency = {
      acquire: jest.fn().mockResolvedValue({ outcome: 'acquired' }),
      complete: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      retake: jest.fn().mockResolvedValue(true),
    };

    prisma = {
      recommendationTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      recommendation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        createMany: jest.fn(),
      },
      // N20: 관련 제품 연결 — 기본은 링크 없음(빈 배열).
      recommendationProduct: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      diagnosis: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RecommendationService,
        { provide: GeminiClient, useValue: geminiClient },
        { provide: ConsentService, useValue: consentService },
        { provide: IdempotencyService, useValue: idempotency },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(RecommendationService);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: Record<string, unknown>) => unknown) =>
        callback({
          ...prisma,
          $executeRaw: jest.fn().mockResolvedValue(1),
        }),
    );
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templateRow = (over: Partial<any> = {}): any => ({
    id: 'rec-1',
    title: '자외선 차단제 재도포',
    grade: 'A',
    sourceLabel: '대한피부과학회 자외선 가이드라인',
    explanation: '오늘 자외선지수 8.',
    observationalNote: null,
    ingredientTags: ['SPF50+', '징크옥사이드'],
    timing: null,
    createdAt: new Date(),
    ...over,
  });

  describe('listGlobal', () => {
    it('전역 템플릿 목록 반환 (grade 필터 없음)', async () => {
      prisma.recommendationTemplate.findMany.mockResolvedValue([templateRow()]);
      // limit 미지정이므로 배열 응답(비커서)이다.
      const result = (await service.listGlobal()) as RecommendationDto[];
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rec-1');
      expect(result[0].grade).toBe(EvidenceGrade.A);
      expect(result[0].relatedProductIds).toEqual([]);
    });

    it('N20: 템플릿별 관련 제품 id를 일괄 조회해 채운다', async () => {
      prisma.recommendationTemplate.findMany.mockResolvedValue([templateRow()]);
      prisma.recommendationProduct.findMany.mockResolvedValue([
        { templateId: 'rec-1', productId: 'prod-1' },
        { templateId: 'rec-1', productId: 'prod-3' },
      ]);
      const result = (await service.listGlobal()) as RecommendationDto[];
      expect(result[0].relatedProductIds).toEqual(['prod-1', 'prod-3']);
      // displayOrder 정렬 옵션이 전달된다.
      expect(prisma.recommendationProduct.findMany).toHaveBeenCalledWith({
        where: { templateId: { in: ['rec-1'] } },
        select: { templateId: true, productId: true },
        orderBy: { displayOrder: 'asc' },
      });
    });

    it('grade 필터 전달', async () => {
      prisma.recommendationTemplate.findMany.mockResolvedValue([]);
      await service.listGlobal(EvidenceGrade.B);
      expect(prisma.recommendationTemplate.findMany).toHaveBeenCalledWith({
        where: { grade: EvidenceGrade.B },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: undefined,
      });
    });
  });

  describe('generate (호환 모드 — skinScore+weather)', () => {
    it('Gemini 응답으로 B등급 추천 생성 및 저장', async () => {
      geminiClient.generateRecommendations.mockResolvedValue([
        {
          title: '이중 세안 권장',
          explanation: 'PM2.5로 인해 이중 세안이 도움될 수 있어요.',
          ingredientTags: ['세라마이드', '약산성 클렌저'],
          timing: '외출 후',
        },
      ]);

      const result = await service.generate(1, {
        skinScore: { id: 'snap-1', overallScore: 70 },
        weather: { uvIndex: 5 },
      });

      expect(result).toHaveLength(1);
      expect(result[0].grade).toBe(EvidenceGrade.B);
      expect(result[0].timing).toBe('외출 후');
      expect(prisma.recommendation.createMany).toHaveBeenCalledTimes(1);
    });

    it('N20: 생성 추천의 성분 태그와 매칭되는 제품을 연결한다', async () => {
      geminiClient.generateRecommendations.mockResolvedValue([
        {
          title: '세라마이드 보습 추천',
          explanation: '보습에 도움될 수 있어요.',
          ingredientTags: ['세라마이드'],
          timing: '자기 전',
        },
      ]);
      // 카탈로그에 세라마이드 제품 1건 존재 → 연결되어야 한다.
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-4',
          name: '세라마이드 리페어 밤',
          brand: '일리윤',
          imageUri: null,
          matchedGrade: 'B',
          matchedIngredients: ['세라마이드', '시어버터'],
          category: 'moisture',
          reason: null,
          timing: null,
          createdAt: new Date(),
        },
      ]);
      // attachProductIds가 방금 생성한 추천 id로 조회하므로, 조회된 id에 맞춰 응답한다.
      prisma.recommendationProduct.findMany.mockImplementation(
        async (args: { where: { recommendationId: { in: string[] } } }) => {
          const id = args.where.recommendationId.in[0];
          return [{ recommendationId: id, productId: 'prod-4' }];
        },
      );

      const result = await service.generate(1, {
        skinScore: { id: 'snap-1', overallScore: 70 },
        weather: { uvIndex: 5 },
      });

      // 매칭된 제품이 RecommendationProduct로 연결되고 응답에도 반영된다.
      expect(prisma.recommendationProduct.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ productId: 'prod-4', displayOrder: 0 }),
        ]),
      });
      expect(result[0].relatedProductIds).toEqual(['prod-4']);
    });

    it('Gemini 실패 시 503 ServiceUnavailable', async () => {
      geminiClient.generateRecommendations.mockRejectedValue(
        new GeminiUnavailable('GEMINI_API_KEY not configured'),
      );
      await expect(
        service.generate(1, { skinScore: {}, weather: {} }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('generate (diagnosisId 모드 — 최종 계약)', () => {
    it('소유권 검사 후 DB에서 측정값/날씨 조회', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({
        id: 'diag-1',
        userId: 1,
        capturedAt: new Date(),
        overallScore: 75,
        thumbnailUri: null,
        skinMetrics: [{ part: 'forehead', label: '이마', grade: '양호', moisture: 70, elasticity: 68, note: null }],
        weatherSnapshot: {
          observedAt: new Date(),
          regionName: '서울',
          uvIndex: 5, uvStatus: 'moderate',
          uvIndexPeak: 8, uvStatusPeak: 'bad', uvIndexPeakHour: 13,
          ozonePpm: 0.03, ozoneStatus: 'good',
          pm25: 20, pm25Status: 'moderate', pm10: 40, pm10Status: 'moderate',
          caiValue: 80, caiStatus: 'moderate',
          no2Value: 0.02, so2Value: 0.005, coValue: 0.4,
        },
      });
      prisma.recommendation.findMany.mockResolvedValue([]); // 중복 없음
      geminiClient.generateRecommendations.mockResolvedValue([
        { title: 'T', explanation: 'E', ingredientTags: [], timing: null },
      ]);

      const result = await service.generate(1, { diagnosisId: 'diag-1' });
      expect(result).toHaveLength(1);
      expect(prisma.diagnosis.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'diag-1', deletedAt: null }),
        }),
      );
    });

    it('타 사용자 진단 접근 시 403 Forbidden', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({
        id: 'diag-1', userId: 999,
        capturedAt: new Date(), overallScore: 70, thumbnailUri: null,
        skinMetrics: [], weatherSnapshot: null,
      });
      await expect(service.generate(1, { diagnosisId: 'diag-1' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('존재하지 않는 진단 시 404 NotFound', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue(null);
      await expect(service.generate(1, { diagnosisId: 'nope' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('동일 진단 중복 생성 방지 — 기존 추천 반환', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({
        id: 'diag-1', userId: 1,
        capturedAt: new Date(), overallScore: 70, thumbnailUri: null,
        skinMetrics: [], weatherSnapshot: null,
      });
      prisma.recommendation.findMany.mockResolvedValue([
        { id: 'gemini-old', userId: 1, diagnosisId: 'diag-1',
          title: '기존 추천', grade: 'B',
          sourceLabel: 'AI 종합 분석 · 피부과학 일반 지식 기반',
          explanation: '...', observationalNote: null,
          ingredientTags: [], timing: null, createdAt: new Date() },
      ]);

      const result = await service.generate(1, { diagnosisId: 'diag-1' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('gemini-old');
      expect(geminiClient.generateRecommendations).not.toHaveBeenCalled();
      expect(prisma.recommendation.createMany).not.toHaveBeenCalled();
    });
  });

  describe('generate — N14 외부 AI 호출 멱등성', () => {
    beforeEach(() => {
      prisma.diagnosis.findFirst.mockResolvedValue({
        id: 'diag-1', userId: 1,
        capturedAt: new Date(), overallScore: 70, thumbnailUri: null,
        skinMetrics: [], weatherSnapshot: null,
      });
      prisma.recommendation.findMany.mockResolvedValue([]);
      geminiClient.generateRecommendations.mockResolvedValue([
        { title: 'T', explanation: 'E', ingredientTags: [], timing: null },
      ]);
    });

    it('Gemini 호출 전에 예약을 획득하고 성공 시 complete로 전환한다', async () => {
      await service.generate(1, { diagnosisId: 'diag-1' });
      expect(idempotency.acquire).toHaveBeenCalledWith('recommendation:diag-1', 1);
      expect(idempotency.complete).toHaveBeenCalledWith('recommendation:diag-1');
      expect(idempotency.release).not.toHaveBeenCalled();
    });

    it('in-flight 예약(동시 요청)은 409 Conflict + Gemini 미호출', async () => {
      idempotency.acquire.mockResolvedValue({ outcome: 'in_flight' });
      await expect(service.generate(1, { diagnosisId: 'diag-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(geminiClient.generateRecommendations).not.toHaveBeenCalled();
    });

    it('completed 예약 + 기존 결과 존재 시 동일 결과 재반환 (Gemini 미호출)', async () => {
      idempotency.acquire.mockResolvedValue({ outcome: 'completed' });
      prisma.recommendation.findMany.mockResolvedValue([
        { id: 'gemini-old', userId: 1, diagnosisId: 'diag-1',
          title: '기존 추천', grade: 'B',
          sourceLabel: 'AI 종합 분석 · 피부과학 일반 지식 기반',
          explanation: '...', observationalNote: null,
          ingredientTags: [], timing: null, createdAt: new Date() },
      ]);

      const result = await service.generate(1, { diagnosisId: 'diag-1' });
      expect(result[0].id).toBe('gemini-old');
      expect(geminiClient.generateRecommendations).not.toHaveBeenCalled();
      expect(idempotency.retake).not.toHaveBeenCalled();
    });

    it('completed 예약인데 결과가 없으면 retake 후 재생성한다', async () => {
      idempotency.acquire.mockResolvedValue({ outcome: 'completed' });
      // findMany는 [] (이미 mock 기본값) → retake 성공 후 진행
      await service.generate(1, { diagnosisId: 'diag-1' });
      expect(idempotency.retake).toHaveBeenCalledWith('recommendation:diag-1');
      expect(geminiClient.generateRecommendations).toHaveBeenCalledTimes(1);
      expect(idempotency.complete).toHaveBeenCalledWith('recommendation:diag-1');
    });

    it('completed + retake 경쟁에서 남이 먼저 retake하면 409 Conflict', async () => {
      idempotency.acquire.mockResolvedValue({ outcome: 'completed' });
      idempotency.retake.mockResolvedValue(false);
      await expect(service.generate(1, { diagnosisId: 'diag-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(geminiClient.generateRecommendations).not.toHaveBeenCalled();
    });

    it('Gemini 실패(503) 시 예약을 release해 재시도를 허용한다', async () => {
      geminiClient.generateRecommendations.mockRejectedValue(
        new GeminiUnavailable('GEMINI_API_KEY not configured'),
      );
      await expect(service.generate(1, { diagnosisId: 'diag-1' })).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(idempotency.release).toHaveBeenCalledWith('recommendation:diag-1');
      expect(idempotency.complete).not.toHaveBeenCalled();
    });

    it('호환 모드(skinScore+weather, diagnosisId 없음)는 예약을 사용하지 않는다', async () => {
      await service.generate(1, { skinScore: { id: 'snap-1' }, weather: { uvIndex: 5 } });
      expect(idempotency.acquire).not.toHaveBeenCalled();
      expect(idempotency.complete).not.toHaveBeenCalled();
      expect(prisma.recommendation.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getById', () => {
    it('생성 추천 — 소유자 조회 성공', async () => {
      prisma.recommendation.findUnique.mockResolvedValue({
        id: 'gemini-1', userId: 1, diagnosisId: null,
        title: 'T', grade: 'B',
        sourceLabel: 'src', explanation: 'E', observationalNote: null,
        ingredientTags: [], timing: null, createdAt: new Date(),
      });
      const result = await service.getById(1, 'gemini-1');
      expect(result.id).toBe('gemini-1');
    });

    it('생성 추천 — 타 사용자 접근 시 403', async () => {
      prisma.recommendation.findUnique.mockResolvedValue({
        id: 'gemini-1', userId: 999, diagnosisId: null,
        title: 'T', grade: 'B',
        sourceLabel: 'src', explanation: 'E', observationalNote: null,
        ingredientTags: [], timing: null, createdAt: new Date(),
      });
      await expect(service.getById(1, 'gemini-1')).rejects.toThrow(ForbiddenException);
    });

    it('전역 템플릿 조회 성공 (Recommendation에 없으면 Template에서)', async () => {
      prisma.recommendation.findUnique.mockResolvedValue(null);
      prisma.recommendationTemplate.findUnique.mockResolvedValue(templateRow());
      const result = await service.getById(null, 'rec-1');
      expect(result.id).toBe('rec-1');
      expect(result.grade).toBe(EvidenceGrade.A);
    });

    it('존재하지 않는 id 시 404', async () => {
      prisma.recommendation.findUnique.mockResolvedValue(null);
      prisma.recommendationTemplate.findUnique.mockResolvedValue(null);
      await expect(service.getById(1, 'nope')).rejects.toThrow(NotFoundException);
    });
  });
});
