import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JobStatus } from './enums/job-status.enum';
import { JobType } from './enums/job-type.enum';
import { buildJobDedupeKey } from './job-dedupe';
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
        // R10: dedupe 키는 payload를 저장하는 이 지점에서만 만든다. 호출부가
        // 따로 넘기면 payload와 어긋난 키가 저장될 수 있다.
        dedupeKey: buildJobDedupeKey(input.type, input.payload),
      },
    });
  }

  /**
   * R10: dedupe 조회 — 최근 창 안의 같은 dedupe 키 job을 최신순으로 1건 찾는다.
   *
   * status 필터를 걸지 않는다. AsyncJobStatus는 PENDING/COMPLETED/FAILED 세 값뿐이고
   * 호출부는 그 셋을 모두 재사용 후보로 보므로 필터가 아무것도 걸러내지 않는다.
   *
   * 마이그레이션 직후 과거 행은 `dedupeKey`가 NULL이라 조회에 걸리지 않는다.
   * dedupe 창이 수 분 단위라 배포 직후 창 안에서만 중복 enqueue가 한 번 생길 수
   * 있고, 그 뒤로는 신규 행이 키를 채워 정상 동작한다.
   */
  async findRecentByDedupeKey(input: {
    userId: number;
    type: JobType;
    dedupeKey: string;
    withinMs: number;
  }) {
    return this.prisma.asyncJob.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        dedupeKey: input.dedupeKey,
        createdAt: { gte: new Date(Date.now() - input.withinMs) },
      },
      orderBy: { createdAt: 'desc' },
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
