import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JobStatus } from './enums/job-status.enum';
import { JobType } from './enums/job-type.enum';
import { JobResponseDto } from './dto/job-response.dto';

/**
 * AsyncJob DB 상태만 담당한다.
 * Dispatcher ↔ JobService 순환 의존을 막기 위해 분리했다.
 */
@Injectable()
export class JobStateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    userId: number;
    type: JobType;
    priority: number;
    maxAttempts: number;
    queueName: string;
    payload: Record<string, unknown>;
  }) {
    return this.prisma.asyncJob.create({
      data: {
        userId: input.userId,
        type: input.type,
        status: JobStatus.PENDING,
        priority: input.priority,
        maxAttempts: input.maxAttempts,
        queueName: input.queueName,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }

  async setBullJobId(jobId: string, bullJobId: string): Promise<void> {
    await this.prisma.asyncJob.update({
      where: { id: jobId },
      data: { bullJobId },
    });
  }

  async getForUser(jobId: string, userId: number): Promise<JobResponseDto> {
    const job = await this.prisma.asyncJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('작업을 찾을 수 없습니다');
    }
    if (job.userId !== userId) {
      throw new ForbiddenException('해당 작업에 대한 접근 권한이 없습니다');
    }
    return this.toDto(job);
  }

  async markStarted(jobId: string, attempt: number): Promise<void> {
    await this.prisma.asyncJob.update({
      where: { id: jobId },
      data: {
        attempts: attempt,
        startedAt: new Date(),
        status: JobStatus.PENDING,
      },
    });
  }

  async markCompleted(jobId: string, result: unknown): Promise<void> {
    await this.prisma.asyncJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        result: result as Prisma.InputJsonValue,
        error: null,
        finishedAt: new Date(),
      },
    });
  }

  async markFailed(
    jobId: string,
    error: string,
    deadLetter = false,
  ): Promise<void> {
    await this.prisma.asyncJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        error: error.slice(0, 2000),
        deadLetter,
        finishedAt: new Date(),
      },
    });
  }

  private toDto(job: {
    id: string;
    type: string;
    status: string;
    priority: number;
    attempts: number;
    maxAttempts: number;
    queueName: string;
    result: unknown;
    error: string | null;
    deadLetter: boolean;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  }): JobResponseDto {
    return {
      id: job.id,
      type: job.type as JobType,
      status: job.status as JobStatus,
      priority: job.priority,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      queueName: job.queueName,
      result: job.result ?? undefined,
      error: job.error,
      deadLetter: job.deadLetter,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    };
  }
}
