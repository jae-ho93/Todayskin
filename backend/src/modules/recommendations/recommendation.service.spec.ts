import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { GeminiClient, GeminiUnavailable } from '../gemini/gemini.client';
import { PrismaService } from '../../prisma/prisma.service';
import { EvidenceGrade } from './enums/evidence-grade.enum';

/**
 * RecommendationService 단위 테스트.
 * Prisma와 GeminiClient를 mock하여 비즈니스 로직(전역 목록, 생성, 중복 방지, 소유권)을 검증.
 */
describe('RecommendationService', () => {
  let service: RecommendationService;
  let geminiClient: { generateRecommendations: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;

  beforeEach(async () => {
    geminiClient = {
      generateRecommendations: jest.fn(),
    };

    prisma = {
      recommendationTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      recommendation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      diagnosis: {
        findUnique: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RecommendationService,
        { provide: GeminiClient, useValue: geminiClient },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(RecommendationService);
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
      const result = await service.listGlobal();
 expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rec-1');
      expect(result[0].grade).toBe(EvidenceGrade.A);
      expect(result[0].relatedProductIds).toEqual([]);
    });

    it('grade 필터 전달', async () => {
      prisma.recommendationTemplate.findMany.mockResolvedValue([]);
      await service.listGlobal(EvidenceGrade.B);
      expect(prisma.recommendationTemplate.findMany).toHaveBeenCalledWith({
        where: { grade: EvidenceGrade.B },
        orderBy: { createdAt: 'asc' },
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
      prisma.recommendation.create.mockResolvedValue({
 id: 'gemini-1', userId: 1, diagnosisId: null,
        title: '이중 세안 권장', grade: 'B',
        sourceLabel: 'AI 종합 분석 · 피부과학 일반 지식 기반',
        explanation: 'PM2.5로 인해 이중 세안이 도움될 수 있어요.',
        observationalNote: null,
        ingredientTags: ['세라마이드', '약산성 클렌저'],
        timing: '외출 후', createdAt: new Date(),
      });

      const result = await service.generate(1, {
        skinScore: { id: 'snap-1', overallScore: 70 },
        weather: { uvIndex: 5 },
      });

      expect(result).toHaveLength(1);
      expect(result[0].grade).toBe(EvidenceGrade.B);
      expect(result[0].timing).toBe('외출 후');
      expect(prisma.recommendation.create).toHaveBeenCalledTimes(1);
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
      prisma.diagnosis.findUnique.mockResolvedValue({
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
      prisma.recommendation.create.mockResolvedValue({
        id: 'gemini-1', userId: 1, diagnosisId: 'diag-1',
        title: 'T', grade: 'B',
        sourceLabel: 'AI 종합 분석 · 피부과학 일반 지식 기반',
        explanation: 'E', observationalNote: null,
        ingredientTags: [], timing: null, createdAt: new Date(),
      });

      const result = await service.generate(1, { diagnosisId: 'diag-1' });
      expect(result).toHaveLength(1);
      expect(prisma.diagnosis.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'diag-1' } }),
      );
    });

    it('타 사용자 진단 접근 시 403 Forbidden', async () => {
      prisma.diagnosis.findUnique.mockResolvedValue({
        id: 'diag-1', userId: 999,
        capturedAt: new Date(), overallScore: 70, thumbnailUri: null,
        skinMetrics: [], weatherSnapshot: null,
      });
      await expect(service.generate(1, { diagnosisId: 'diag-1' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('존재하지 않는 진단 시 404 NotFound', async () => {
      prisma.diagnosis.findUnique.mockResolvedValue(null);
      await expect(service.generate(1, { diagnosisId: 'nope' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('동일 진단 중복 생성 방지 — 기존 추천 반환', async () => {
      prisma.diagnosis.findUnique.mockResolvedValue({
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
      expect(prisma.recommendation.create).not.toHaveBeenCalled();
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
