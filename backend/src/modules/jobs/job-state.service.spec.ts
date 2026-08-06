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