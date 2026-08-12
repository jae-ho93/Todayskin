import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JobStateService } from './job-state.service';
import { JobStatus } from './enums/job-status.enum';
import { JobType } from './enums/job-type.enum';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('JobStateService', () => {
  let service: JobStateService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      asyncJob: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JobStateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(JobStateService);
  });

  describe('create', () => {
    it('PENDING 상태로 AsyncJob을 생성한다', async () => {
      prisma.asyncJob.create.mockResolvedValue({ id: 'job-1' });
      await service.create({
        userId: 1,
        type: JobType.RECOMMENDATION_GENERATE,
        priority: 1,
        maxAttempts: 3,
        queueName: 'recommendation',
        payload: { diagnosisId: 'd1' },
      });
      expect(prisma.asyncJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          type: JobType.RECOMMENDATION_GENERATE,
          status: JobStatus.PENDING,
          priority: 1,
          maxAttempts: 3,
          queueName: 'recommendation',
        }),
      });
    });

    it('R10: payload에서 dedupeKey를 유도해 함께 저장한다', async () => {
      prisma.asyncJob.create.mockResolvedValue({ id: 'job-1' });
      await service.create({
        userId: 1,
        type: JobType.RECOMMENDATION_GENERATE,
        priority: 1,
        maxAttempts: 3,
        queueName: 'recommendation',
        payload: { diagnosisId: 'd1' },
      });
      expect(prisma.asyncJob.create.mock.calls[0][0].data.dedupeKey).toBe(
        'diagnosisId:d1',
      );
    });

    it('R10: dedupe 대상이 아닌 payload는 dedupeKey가 null이다', async () => {
      prisma.asyncJob.create.mockResolvedValue({ id: 'job-2' });
      await service.create({
        userId: 1,
        type: JobType.RECOMMENDATION_GENERATE,
        priority: 1,
        maxAttempts: 3,
        queueName: 'recommendation',
        payload: { skinScore: {}, weather: {} },
      });
      expect(prisma.asyncJob.create.mock.calls[0][0].data.dedupeKey).toBeNull();
    });
  });

  describe('findRecentByDedupeKey (R10)', () => {
    it('dedupeKey 컬럼 + 최근 창으로 조회한다 (payload JSON 경로 사용 금지)', async () => {
      prisma.asyncJob.findFirst.mockResolvedValue({ id: 'job-1' });
      await service.findRecentByDedupeKey({
        userId: 7,
        type: JobType.WEATHER_PRODUCTS_GENERATE,
        dedupeKey: 'regionKey:서울특별시',
        withinMs: 600_000,
      });

      const arg = prisma.asyncJob.findFirst.mock.calls[0][0];
      expect(arg.where).toMatchObject({
        userId: 7,
        type: JobType.WEATHER_PRODUCTS_GENERATE,
        dedupeKey: 'regionKey:서울특별시',
      });
      expect(arg.where.payload).toBeUndefined();
      expect(arg.where.createdAt.gte).toBeInstanceOf(Date);
      expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('status로 걸러내지 않는다 — 세 상태 모두 재사용 후보다', async () => {
      prisma.asyncJob.findFirst.mockResolvedValue(null);
      await service.findRecentByDedupeKey({
        userId: 1,
        type: JobType.RECOMMENDATION_GENERATE,
        dedupeKey: 'diagnosisId:d1',
        withinMs: 1_000,
      });
      expect(prisma.asyncJob.findFirst.mock.calls[0][0].where.status).toBeUndefined();
    });
  });

  describe('markCompleted', () => {
    it('COMPLETED + result + finishedAt를 설정한다', async () => {
      await service.markCompleted('job-1', { ok: true });
      expect(prisma.asyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: JobStatus.COMPLETED,
          result: { ok: true },
          error: null,
          finishedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('markFailed', () => {
    it('FAILED + error + deadLetter=false', async () => {
      await service.markFailed('job-1', 'boom');
      expect(prisma.asyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          error: 'boom',
          deadLetter: false,
          finishedAt: expect.any(Date),
        }),
      });
    });

    it('deadLetter=true 전달 시 반영', async () => {
      await service.markFailed('job-1', 'boom', true);
      expect(prisma.asyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({ deadLetter: true }),
      });
    });

    it('에러 메시지 2000자로 잘린다', async () => {
      const long = 'x'.repeat(3000);
      await service.markFailed('job-1', long);
      const call = prisma.asyncJob.update.mock.calls[0][0];
      expect(call.data.error.length).toBe(2000);
    });
  });

  describe('getForUser', () => {
    it('job이 없으면 404', async () => {
      prisma.asyncJob.findUnique.mockResolvedValue(null);
      await expect(service.getForUser('nope', 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('타 사용자 job이면 403', async () => {
      prisma.asyncJob.findUnique.mockResolvedValue({
        id: 'job-1',
        userId: 2,
        type: JobType.RECOMMENDATION_GENERATE,
        status: JobStatus.PENDING,
        priority: 1,
        attempts: 0,
        maxAttempts: 3,
        queueName: 'recommendation',
        result: null,
        error: null,
        deadLetter: false,
        createdAt: new Date(),
        startedAt: null,
        finishedAt: null,
      });
      await expect(service.getForUser('job-1', 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('본인 job이면 DTO 반환', async () => {
      prisma.asyncJob.findUnique.mockResolvedValue({
        id: 'job-1',
        userId: 1,
        type: JobType.RECOMMENDATION_GENERATE,
        status: JobStatus.COMPLETED,
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        queueName: 'recommendation',
        result: { recommendations: [] },
        error: null,
        deadLetter: false,
        createdAt: new Date('2026-08-07T00:00:00.000Z'),
        startedAt: new Date('2026-08-07T00:00:01.000Z'),
        finishedAt: new Date('2026-08-07T00:00:02.000Z'),
      });
      const dto = await service.getForUser('job-1', 1);
      expect(dto.id).toBe('job-1');
      expect(dto.status).toBe(JobStatus.COMPLETED);
      expect(dto.createdAt).toBe('2026-08-07T00:00:00.000Z');
    });
  });
});