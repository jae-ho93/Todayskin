import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DiagnosisService } from './diagnosis.service';
import {
  INFERENCE_PROVIDER,
  InferenceImages,
  InferenceResult,
} from './providers/inference-provider.interface';
import { WeatherService } from '../weather/weather.service';
import { PrismaService } from '../../prisma/prisma.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * DiagnosisService 단위 테스트.
 * Prisma, InferenceProvider, WeatherService를 mock하여 비즈니스 로직을 검증한다.
 */
describe('DiagnosisService', () => {
  let service: DiagnosisService;
  let inferenceProvider: { infer: jest.Mock };
  let weatherService: { getOrCreateSnapshot: jest.Mock };
  let prisma: Record<string, any>;

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Buffer.from('RIFF0000WEBP', 'ascii');
  const validImages: InferenceImages = {
    front: { buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length },
    left: { buffer: png, mimetype: 'image/png', size: png.length },
    right: { buffer: webp, mimetype: 'image/webp', size: webp.length },
  };

  const validInference: InferenceResult = {
    overallScore: 78,
    modelVersion: 'mock-v0.1.0',
    parts: [
      { part: 'forehead', label: '이마', grade: '양호', moisture: 72, elasticity: 68, note: null },
      { part: 'glabella', label: '미간', grade: '보통', moisture: 60, elasticity: 64, note: null },
      { part: 'eyeArea', label: '눈가', grade: '보통', moisture: 55, elasticity: 58, note: null },
      { part: 'cheek', label: '볼', grade: '양호', moisture: 75, elasticity: 70, note: null },
      { part: 'lips', label: '입술', grade: '건조', moisture: 40, elasticity: null, note: null },
      { part: 'jaw', label: '턱', grade: '양호', moisture: 66, elasticity: 71, note: null },
    ],
  };

  beforeEach(async () => {
    inferenceProvider = { infer: jest.fn() };
    weatherService = { getOrCreateSnapshot: jest.fn() };

    prisma = {
      diagnosis: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      skinMetric: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DiagnosisService,
        { provide: INFERENCE_PROVIDER, useValue: inferenceProvider },
        { provide: WeatherService, useValue: weatherService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(DiagnosisService);
  });

  // ── submit ──────────────────────────────────

  describe('submit', () => {
    beforeEach(() => {
      inferenceProvider.infer.mockResolvedValue(validInference);
      prisma.diagnosis.findFirst.mockResolvedValue(null); // 중복 아님
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const created = {
          id: 'snap-abc',
          userId: 1,
          capturedAt: new Date('2026-08-05T00:00:00.000Z'),
          overallScore: 78,
          thumbnailUri: null,
          status: 'COMPLETED',
          modelVersion: 'mock-v0.1.0',
          weatherSnapshotId: null,
        };
        const tx = {
          diagnosis: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(created),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
          skinMetric: { createMany: jest.fn().mockResolvedValue({ count: 6 }) },
        };
        return cb(tx);
      });
    });

    it('정상 제출 — Diagnosis + SkinMetric transaction 저장 후 스냅샷 반환', async () => {
      const result = await service.submit(1, validImages);
      expect(result.id).toBe('snap-abc');
      expect(result.overallScore).toBe(78);
      expect(result.parts).toHaveLength(6);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(weatherService.getOrCreateSnapshot).toHaveBeenCalledWith(
        undefined,
        undefined,
      );
    });

    it('빈 파일 거부', async () => {
      const empty = {
        ...validImages,
        front: { buffer: Buffer.alloc(0), mimetype: 'image/jpeg', size: 0 },
      };
      await expect(service.submit(1, empty)).rejects.toThrow(BadRequestException);
    });

    it('지원하지 않는 MIME 거부', async () => {
      const bad = {
        ...validImages,
        front: { buffer: Buffer.from('x'), mimetype: 'image/gif', size: 10 },
      };
      await expect(service.submit(1, bad)).rejects.toThrow(BadRequestException);
    });

    it('MIME 헤더와 실제 파일 시그니처가 다르면 거부', async () => {
      const bad = {
        ...validImages,
        front: { buffer: Buffer.from('not-a-jpeg'), mimetype: 'image/jpeg', size: 10 },
      };
      await expect(service.submit(1, bad)).rejects.toThrow(BadRequestException);
      expect(inferenceProvider.infer).not.toHaveBeenCalled();
    });

    it('파일 크기 초과 거부 (10MB)', async () => {
      const big = {
        ...validImages,
        front: { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 11 * 1024 * 1024 },
      };
      await expect(service.submit(1, big)).rejects.toThrow(BadRequestException);
    });

    it('중복 요청(60초 이내) 거부', async () => {
      prisma.diagnosis.findFirst.mockResolvedValueOnce({ id: 'snap-recent' });
      await expect(service.submit(1, validImages)).rejects.toThrow(BadRequestException);
    });

    it('InferenceProvider 실패 시 503', async () => {
      inferenceProvider.infer.mockRejectedValue(new Error('server down'));
      await expect(service.submit(1, validImages)).rejects.toThrow(ServiceUnavailableException);
    });

    it('추론 점수 범위 초과(101) 거부', async () => {
      inferenceProvider.infer.mockResolvedValue({
        ...validInference,
        overallScore: 101,
      });
      await expect(service.submit(1, validImages)).rejects.toThrow(BadRequestException);
    });

    it('추론 부위 개수 불일치(5개) 거부', async () => {
      inferenceProvider.infer.mockResolvedValue({
        ...validInference,
        parts: validInference.parts.slice(0, 5),
      });
      await expect(service.submit(1, validImages)).rejects.toThrow(BadRequestException);
    });

    it('알 수 없는 부위 거부', async () => {
      inferenceProvider.infer.mockResolvedValue({
        ...validInference,
        parts: [
          ...validInference.parts.slice(0, 5),
          { part: 'nose', label: '코', grade: '양호', moisture: 50, elasticity: 50, note: null },
        ],
      });
      await expect(service.submit(1, validImages)).rejects.toThrow(BadRequestException);
    });

    it('날씨 스냅샷 확보 실패해도 진단은 진행(weatherSnapshotId null)', async () => {
      weatherService.getOrCreateSnapshot.mockRejectedValue(new Error('api down'));
      const result = await service.submit(1, validImages, { lat: 37.5, lon: 126.9 });
      expect(result.id).toBe('snap-abc');
    });

    it('날씨 스냅샷 정상 시 weatherSnapshotId 연결', async () => {
      weatherService.getOrCreateSnapshot.mockResolvedValue({ id: 'ws-1' });
      let captured: any;
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const created = {
          id: 'snap-ws',
          userId: 1,
          capturedAt: new Date(),
          overallScore: 78,
          thumbnailUri: null,
          status: 'COMPLETED',
          modelVersion: 'mock-v0.1.0',
          weatherSnapshotId: 'ws-1',
        };
        const tx = {
          diagnosis: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((args: any) => {
              captured = args;
              return Promise.resolve(created);
            }),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
          skinMetric: { createMany: jest.fn().mockResolvedValue({ count: 6 }) },
        };
        return cb(tx);
      });
      const result = await service.submit(1, validImages, { lat: 37.5, lon: 126.9 });
      expect(captured.data.weatherSnapshotId).toBe('ws-1');
      expect(result.id).toBe('snap-ws');
    });
  });

  // ── getLatest ──────────────────────────────────

  describe('getLatest', () => {
    it('진단이 없으면 404', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue(null);
      await expect(service.getLatest(1)).rejects.toThrow(NotFoundException);
    });

    it('최신 진단 반환', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({
        id: 'snap-1',
        userId: 1,
        capturedAt: new Date('2026-08-05T00:00:00.000Z'),
        overallScore: 80,
        thumbnailUri: null,
        skinMetrics: [
          { part: 'forehead', label: '이마', grade: '양호', moisture: 70, elasticity: 65, note: null },
        ],
      });
      const result = await service.getLatest(1);
      expect(result.id).toBe('snap-1');
      expect(result.parts).toHaveLength(1);
    });
  });

  // ── getHistory ──────────────────────────────────

  describe('getHistory', () => {
    it('이력 최신순 반환', async () => {
      prisma.diagnosis.findMany.mockResolvedValue([
        { id: 'snap-2', capturedAt: new Date('2026-08-05T00:00:00.000Z'), overallScore: 80, thumbnailUri: null },
        { id: 'snap-1', capturedAt: new Date('2026-08-04T00:00:00.000Z'), overallScore: 75, thumbnailUri: null },
      ]);
      const result = await service.getHistory(1);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('snap-2');
    });
  });

  // ── getDiagnosisWithMetrics (소유권) ──────────────────────────────────

  describe('getDiagnosisWithMetrics', () => {
    it('진단이 없으면 404', async () => {
      prisma.diagnosis.findUnique.mockResolvedValue(null);
      await expect(service.getDiagnosisWithMetrics(1, 'snap-x')).rejects.toThrow(NotFoundException);
    });

    it('다른 사용자 진단 접근 시 403', async () => {
      prisma.diagnosis.findUnique.mockResolvedValue({
        id: 'snap-x',
        userId: 2,
        capturedAt: new Date(),
        overallScore: 70,
        skinMetrics: [],
      });
      await expect(service.getDiagnosisWithMetrics(1, 'snap-x')).rejects.toThrow(ForbiddenException);
    });

    it('본인 진단이면 정상 반환', async () => {
      prisma.diagnosis.findUnique.mockResolvedValue({
        id: 'snap-x',
        userId: 1,
        capturedAt: new Date(),
        overallScore: 70,
        skinMetrics: [
          { part: 'cheek', label: '볼', grade: '양호', moisture: 75, elasticity: 70, note: null },
        ],
      });
      const result = await service.getDiagnosisWithMetrics(1, 'snap-x');
      expect(result.diagnosis.id).toBe('snap-x');
      expect(result.metrics).toHaveLength(1);
    });
  });
});
