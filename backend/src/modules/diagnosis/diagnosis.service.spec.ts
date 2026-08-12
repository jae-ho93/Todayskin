import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
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
import { ConsentService } from '../consent/consent.service';
import { ImageStorageService } from '../storage/image-storage.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { AuditLogService } from '../admin/audit-log.service';
import { HistoryEntryDto } from './dto/history-entry.dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * DiagnosisService 단위 테스트.
 * Prisma, InferenceProvider, WeatherService를 mock하여 비즈니스 로직을 검증한다.
 */
describe('DiagnosisService', () => {
  let service: DiagnosisService;
  let inferenceProvider: { infer: jest.Mock };
  let weatherService: { getOrCreateSnapshot: jest.Mock };
  let consentService: { requireActive: jest.Mock; hasActive: jest.Mock };
  let imageStorage: {
    storeDiagnosisImage: jest.Mock;
    deleteAllForUser: jest.Mock;
    deleteForDiagnosis: jest.Mock;
    getPresignedUrlForDiagnosis: jest.Mock;
    // R20: 캘린더 경로는 include된 image row로 배치 서명한다.
    presignImages: jest.Mock;
    toPublicUrl: jest.Mock;
  };
  let idempotency: {
    acquire: jest.Mock;
    complete: jest.Mock;
    release: jest.Mock;
    retake: jest.Mock;
  };
  let prisma: Record<string, any>;
  let auditLog: { log: jest.Mock };

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const validImages: InferenceImages = {
    front: { buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length },
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
    consentService = {
      requireActive: jest.fn().mockResolvedValue(undefined),
      hasActive: jest.fn().mockResolvedValue(false),
    };
    imageStorage = {
      storeDiagnosisImage: jest.fn(),
      deleteAllForUser: jest.fn(),
      deleteForDiagnosis: jest.fn().mockResolvedValue(1),
      getPresignedUrlForDiagnosis: jest.fn(),
      presignImages: jest.fn().mockResolvedValue([]),
      // BE-2026-08-12: 스냅샷 thumbnailUri 정규화 — memory:// → http 변환을 흉내낸다
      toPublicUrl: jest.fn((uri: string) =>
        uri.startsWith('memory://')
          ? `http://127.0.0.1:3000/dev-storage/${uri.slice('memory://'.length)}`
          : uri,
      ),
    };
    idempotency = {
      acquire: jest.fn().mockResolvedValue({ outcome: 'acquired' }),
      complete: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      retake: jest.fn().mockResolvedValue(undefined),
    };

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
      recommendation: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DiagnosisService,
        { provide: INFERENCE_PROVIDER, useValue: inferenceProvider },
        { provide: WeatherService, useValue: weatherService },
        { provide: ConsentService, useValue: consentService },
        { provide: ImageStorageService, useValue: imageStorage },
        { provide: IdempotencyService, useValue: idempotency },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = moduleRef.get(DiagnosisService);
  });

  // ── submit ──────────────────────────────────

  describe('submit', () => {
    // 트랜잭션 내부의 중복 검사 — 사전 검사와 같은 조건을 쓰는지 확인용(R35).
    let txFindFirst: jest.Mock;

    beforeEach(() => {
      inferenceProvider.infer.mockResolvedValue(validInference);
      prisma.diagnosis.findFirst.mockResolvedValue(null); // 중복 아님
      txFindFirst = jest.fn().mockResolvedValue(null);
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
            findFirst: txFindFirst,
            create: jest.fn().mockResolvedValue(created),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
          skinMetric: { createMany: jest.fn().mockResolvedValue({ count: 6 }) },
        };
        return cb(tx);
      });
    });

    it('정상 제출 — Diagnosis + SkinMetric transaction 저장 후 스냅샷 반환', async () => {
      // wentOutside=true면 좌표가 없어도 기본 지역으로 날씨 스냅샷을 확보한다.
      const result = await service.submit(1, validImages, { wentOutside: true });
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

    it('R35: 중복 사전 검사는 추론 호출 전에 거부한다 (추론 비용 낭비 방지)', async () => {
      prisma.diagnosis.findFirst.mockResolvedValueOnce({ id: 'snap-recent' });
      await expect(service.submit(1, validImages)).rejects.toThrow(BadRequestException);
      expect(inferenceProvider.infer).not.toHaveBeenCalled();
    });

    it('R35: 삭제된 진단은 중복 판정에서 제외한다 (사전·트랜잭션 검사 동일 기준)', async () => {
      await service.submit(1, validImages);
      const preCheckWhere = prisma.diagnosis.findFirst.mock.calls[0][0].where;
      const txCheckWhere = txFindFirst.mock.calls[0][0].where;
      expect(preCheckWhere).toMatchObject({ userId: 1, deletedAt: null });
      expect(txCheckWhere).toMatchObject({ userId: 1, deletedAt: null });
    });

    it('InferenceProvider 실패 시 503', async () => {
      inferenceProvider.infer.mockRejectedValue(new Error('server down'));
      await expect(service.submit(1, validImages)).rejects.toThrow(ServiceUnavailableException);
    });

    it('N14: 동시 진단 요청(in-flight 예약)은 409 Conflict', async () => {
      idempotency.acquire.mockResolvedValue({ outcome: 'in_flight' });
      await expect(service.submit(1, validImages, { wentOutside: true })).rejects.toThrow(
        ConflictException,
      );
      // N14 핵심: 외부 추론을 호출하지 않는다 (비용 중복 방지).
      expect(inferenceProvider.infer).not.toHaveBeenCalled();
      expect(idempotency.release).not.toHaveBeenCalled();
    });

    it('N14: 정상 완료 시 예약을 해제(release)한다', async () => {
      await service.submit(1, validImages, { wentOutside: true });
      expect(idempotency.acquire).toHaveBeenCalledWith('diagnosis:1', 1);
      expect(idempotency.release).toHaveBeenCalledWith('diagnosis:1');
    });

    it('N14: 예약 획득 후에도 추론 실패 시 release로 해제한다', async () => {
      inferenceProvider.infer.mockRejectedValue(new Error('server down'));
      await expect(service.submit(1, validImages)).rejects.toThrow(ServiceUnavailableException);
      expect(idempotency.release).toHaveBeenCalledWith('diagnosis:1');
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
      const result = await service.submit(1, validImages, {
        lat: 37.5,
        lon: 126.9,
        wentOutside: true,
      });
      expect(result.id).toBe('snap-abc');
    });

    it('N26: 저장 동의 시에만 landmarks를 영속화한다', async () => {
      consentService.hasActive.mockResolvedValue(true);
      inferenceProvider.infer.mockResolvedValue({
        ...validInference,
        landmarks: { version: 'mediapipe-face-landmarker-v1', points: [[0.4, 0.3]] },
      });
      imageStorage.storeDiagnosisImage.mockResolvedValue({ uri: 'memory://bucket/key' });
      let captured: any;
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const created = {
          id: 'snap-lm',
          userId: 1,
          capturedAt: new Date(),
          overallScore: 78,
          thumbnailUri: null,
          status: 'COMPLETED',
          modelVersion: 'mock-v0.1.0',
          weatherSnapshotId: null,
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

      await service.submit(1, validImages);
      expect(captured.data.landmarks).toEqual({
        version: 'mediapipe-face-landmarker-v1',
        points: [[0.4, 0.3]],
      });
    });

    it('N26: 미동의면 inference가 landmarks를 제공해도 저장하지 않는다', async () => {
      // beforeEach 기본 hasActive=false (저장 미동의)
      inferenceProvider.infer.mockResolvedValue({
        ...validInference,
        landmarks: { version: 'mediapipe-face-landmarker-v1', points: [[0.4, 0.3]] },
      });
      let captured: any;
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const created = {
          id: 'snap-nolm',
          userId: 1,
          capturedAt: new Date(),
          overallScore: 78,
          thumbnailUri: null,
          status: 'COMPLETED',
          modelVersion: 'mock-v0.1.0',
          weatherSnapshotId: null,
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

      await service.submit(1, validImages);
      expect(captured.data.landmarks).toBeUndefined();
      expect(imageStorage.storeDiagnosisImage).not.toHaveBeenCalled();
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
      const result = await service.submit(1, validImages, {
        lat: 37.5,
        lon: 126.9,
        wentOutside: true,
      });
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
      const result = (await service.getHistory(1)) as HistoryEntryDto[];
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('snap-2');
    });
  });

  // ── getDiagnosisWithMetrics (소유권) ──────────────────────────────────

  describe('getDiagnosisWithMetrics', () => {
    it('진단이 없으면 404', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue(null);
      await expect(service.getDiagnosisWithMetrics(1, 'snap-x')).rejects.toThrow(NotFoundException);
    });

    it('다른 사용자 진단 접근 시 403', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({
        id: 'snap-x',
        userId: 2,
        capturedAt: new Date(),
        overallScore: 70,
        skinMetrics: [],
      });
      await expect(service.getDiagnosisWithMetrics(1, 'snap-x')).rejects.toThrow(ForbiddenException);
    });

    it('본인 진단이면 정상 반환', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({
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

  // ── N43 기록 삭제 ──────────────────────────────────

  describe('deleteDiagnosis', () => {
    const tx = {
      recommendation: { deleteMany: jest.fn() },
      diagnosis: { delete: jest.fn() },
    };

    beforeEach(() => {
      tx.recommendation.deleteMany.mockClear();
      tx.diagnosis.delete.mockClear();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
    });

    it('진단이 없으면 404', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue(null);
      await expect(service.deleteDiagnosis(1, 'd-1')).rejects.toThrow(NotFoundException);
      expect(imageStorage.deleteForDiagnosis).not.toHaveBeenCalled();
    });

    it('남의 기록은 지울 수 없다 — 403이고 이미지에 손대지 않는다', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({ id: 'd-1', userId: 2 });
      await expect(service.deleteDiagnosis(1, 'd-1')).rejects.toThrow(ForbiddenException);
      expect(imageStorage.deleteForDiagnosis).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('본인 기록이면 이미지·추천·진단을 모두 지운다', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({ id: 'd-1', userId: 1 });

      await service.deleteDiagnosis(1, 'd-1');

      expect(imageStorage.deleteForDiagnosis).toHaveBeenCalledWith(1, 'd-1');
      // 추천은 SetNull이라 명시적으로 지우지 않으면 사용자에게 그대로 남는다.
      expect(tx.recommendation.deleteMany).toHaveBeenCalledWith({
        where: { diagnosisId: 'd-1', userId: 1 },
      });
      expect(tx.diagnosis.delete).toHaveBeenCalledWith({ where: { id: 'd-1' } });
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'diagnosis.deleted', targetId: 'd-1' }),
      );
    });

    it('이미지 삭제가 실패하면 진단 row를 남긴다 — 사진만 남고 기록이 사라지는 것을 막는다', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({ id: 'd-1', userId: 1 });
      imageStorage.deleteForDiagnosis.mockRejectedValue(new ServiceUnavailableException());

      await expect(service.deleteDiagnosis(1, 'd-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(auditLog.log).not.toHaveBeenCalled();
    });
  });

  // ── N8 calendar history ──────────────────────────────────

  describe('getHistoryByDate', () => {
    it('잘못된 날짜면 400', async () => {
      await expect(service.getHistoryByDate(1, '2026-13-01')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('미동의 시 image/landmarks를 null로 반환', async () => {
      consentService.hasActive.mockResolvedValue(false);
      prisma.diagnosis.findMany.mockResolvedValue([
        {
          id: 'snap-day',
          userId: 1,
          capturedAt: new Date('2026-08-05T16:30:00.000Z'),
          overallScore: 81,
          status: 'COMPLETED',
          modelVersion: 'mock-v0.1.0',
          landmarks: { version: 'v1', points: [[0.1, 0.2]] },
          skinMetrics: [
            {
              part: 'cheek',
              label: '볼',
              grade: '양호',
              moisture: 70,
              elasticity: 68,
              note: null,
            },
          ],
          weatherSnapshot: {
            observedAt: new Date('2026-08-06T03:00:00.000Z'),
            regionName: '서울특별시',
            source: 'LIVE',
            uvIndex: 5,
            uvStatus: 'moderate',
            uvIndexPeak: 7,
            uvStatusPeak: 'bad',
            uvIndexPeakHour: 14,
            ozonePpm: null,
            ozoneStatus: null,
            pm25: 20,
            pm25Status: 'good',
            pm10: 30,
            pm10Status: 'good',
            caiValue: null,
            caiStatus: null,
            no2Value: null,
            so2Value: null,
            coValue: null,
          },
          recommendations: [],
          image: { deletedAt: null },
        },
      ]);

      const result = await service.getHistoryByDate(1, '2026-08-06');
      expect(result.date).toBe('2026-08-06');
      expect(result.diagnoses).toHaveLength(1);
      expect(result.diagnoses[0].weather?.regionName).toBe('서울특별시');
      expect(result.diagnoses[0].image).toBeNull();
      expect(result.diagnoses[0].landmarks).toBeNull();
      expect(imageStorage.presignImages).not.toHaveBeenCalled();
    });

    it('N26: 저장 동의지만 이미지가 soft-deleted면 image·landmarks 모두 숨긴다 (이미지 없음)', async () => {
      consentService.hasActive.mockResolvedValue(true);
      prisma.diagnosis.findMany.mockResolvedValue([
        {
          id: 'snap-deleted-img',
          userId: 1,
          capturedAt: new Date('2026-08-05T16:30:00.000Z'),
          overallScore: 81,
          status: 'COMPLETED',
          modelVersion: 'mock-v0.1.0',
          // DB에는 남아 있지만(감사 보존) 이미지가 삭제된 상태 — landmarks도 노출하면 안 된다.
          landmarks: { version: 'v1', points: [[0.1, 0.2]] },
          skinMetrics: [],
          weatherSnapshot: null,
          recommendations: [],
          image: { deletedAt: new Date() },
        },
      ]);

      const result = await service.getHistoryByDate(1, '2026-08-06');
      expect(result.diagnoses[0].image).toBeNull();
      expect(result.diagnoses[0].landmarks).toBeNull();
      // R20: 노출 대상이 없으면 서명 자체를 시도하지 않는다.
      expect(imageStorage.presignImages).not.toHaveBeenCalled();
    });

    it('N26: 저장 동의지만 이미지 row가 없으면 image·landmarks 모두 null (이미지 없음)', async () => {
      consentService.hasActive.mockResolvedValue(true);
      prisma.diagnosis.findMany.mockResolvedValue([
        {
          id: 'snap-no-img',
          userId: 1,
          capturedAt: new Date('2026-08-05T16:30:00.000Z'),
          overallScore: 81,
          status: 'COMPLETED',
          modelVersion: 'mock-v0.1.0',
          // 저장 실패 등으로 이미지가 아예 없는 진단 (landmarks는 잔재로 남아 있을 수 있음).
          landmarks: { version: 'v1', points: [[0.1, 0.2]] },
          skinMetrics: [],
          weatherSnapshot: null,
          recommendations: [],
          image: null,
        },
      ]);

      const result = await service.getHistoryByDate(1, '2026-08-06');
      expect(result.diagnoses[0].image).toBeNull();
      expect(result.diagnoses[0].landmarks).toBeNull();
      expect(imageStorage.presignImages).not.toHaveBeenCalled();
    });

    it('저장 동의 시 image·landmarks를 노출', async () => {
      consentService.hasActive.mockResolvedValue(true);
      // BE-2026-08-12: memory 스토어는 dev-storage http URL을 발급한다
      imageStorage.presignImages.mockResolvedValue([
        {
          url: 'http://127.0.0.1:3000/dev-storage/todayskin-local/diagnoses/1/front.jpg',
          contentType: 'image/jpeg',
          expiresAt: '2026-08-06T12:15:00.000Z',
        },
      ]);
      prisma.diagnosis.findMany.mockResolvedValue([
        {
          id: 'snap-day',
          userId: 1,
          capturedAt: new Date('2026-08-05T16:30:00.000Z'),
          overallScore: 81,
          status: 'COMPLETED',
          modelVersion: 'mock-v0.1.0',
          landmarks: { version: 'mediapipe-face-landmarker-v1', points: [[0.4, 0.3]] },
          skinMetrics: [],
          weatherSnapshot: null,
          recommendations: [
            {
              id: 'rec-1',
              title: '보습',
              grade: 'B',
              sourceLabel: '테스트',
              explanation: '설명',
              observationalNote: null,
              ingredientTags: ['세라마이드'],
              timing: '세안 후',
              products: [
                {
                  displayOrder: 0,
                  product: {
                    id: 'p1',
                    name: '크림',
                    brand: 'Brand',
                    imageUri: null,
                    category: 'moisture',
                    reason: null,
                    timing: '세안 후',
                  },
                },
              ],
            },
          ],
          image: {
            deletedAt: null,
            s3Bucket: 'todayskin-local',
            s3Key: 'diagnoses/1/front.jpg',
            contentType: 'image/jpeg',
          },
        },
      ]);

      const result = await service.getHistoryByDate(1, '2026-08-06');
      expect(result.diagnoses[0].image?.url).toContain('/dev-storage/');
      // R20: 진단마다 DB를 다시 읽지 않고, include된 row로 한 번에 서명한다.
      expect(imageStorage.presignImages).toHaveBeenCalledTimes(1);
      expect(imageStorage.presignImages.mock.calls[0][0]).toEqual([
        {
          deletedAt: null,
          s3Bucket: 'todayskin-local',
          s3Key: 'diagnoses/1/front.jpg',
          contentType: 'image/jpeg',
        },
      ]);
      expect(result.diagnoses[0].landmarks?.points).toEqual([[0.4, 0.3]]);
      expect(result.diagnoses[0].recommendations[0].products[0].name).toBe('크림');
    });
  });

  describe('getScoreSeries', () => {
    it('from > to 이면 400', async () => {
      await expect(
        service.getScoreSeries(1, { from: '2026-08-10', to: '2026-08-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('기간 내 overallScore 시계열을 반환', async () => {
      prisma.diagnosis.findMany.mockResolvedValue([
        {
          id: 'snap-a',
          capturedAt: new Date('2026-08-01T03:00:00.000Z'),
          overallScore: 70,
        },
        {
          id: 'snap-b',
          capturedAt: new Date('2026-08-05T16:00:00.000Z'),
          overallScore: 82,
        },
      ]);
      const result = await service.getScoreSeries(1, {
        from: '2026-08-01',
        to: '2026-08-06',
      });
      expect(result.from).toBe('2026-08-01');
      expect(result.to).toBe('2026-08-06');
      expect(result.points).toHaveLength(2);
      expect(result.points[1].date).toBe('2026-08-06');
      expect(result.points[1].overallScore).toBe(82);
    });
  });
});
