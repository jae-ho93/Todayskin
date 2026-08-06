import { Inject, Injectable, Logger } from '@nestjs/common';
import { JOB_DISPATCHER, JOB_POLICIES } from './jobs.constants';
import type { JobDispatcher } from './dispatchers/job-dispatcher.interface';
import { JobStatus } from './enums/job-status.enum';
import { JobType } from './enums/job-type.enum';
import { EnqueueJobResponseDto, JobResponseDto } from './dto/job-response.dto';
import { JobStateService } from './job-state.service';

/**
 * JobService — enqueue + 조회 파사드.
 * API는 enqueue 후 즉시 jobId를 반환하고, 결과는 polling/SSE로 조회한다.
 */
@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    private readonly state: JobStateService,
    @Inject(JOB_DISPATCHER)
    private readonly dispatcher: JobDispatcher,
  ) {}

  async enqueue(
    userId: number,
    type: JobType,
    payload: Record<string, unknown>,
  ): Promise<EnqueueJobResponseDto> {
    const policy = JOB_POLICIES[type];
    const created = await this.state.create({
      userId,
      type,
      priority: policy.priority,
      maxAttempts: policy.attempts,
      queueName: policy.queueName,
      payload,
    });

    try {
      const bullJobId = await this.dispatcher.dispatch({
        jobId: created.id,
        type,
        queueName: policy.queueName,
        userId,
        payload,
        priority: policy.priority,
        attempts: policy.attempts,
        backoffDelayMs: policy.backoffDelayMs,
      });

      if (bullJobId) {
        await this.state.setBullJobId(created.id, bullJobId);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to dispatch job ${created.id}: ${message}`);
      await this.state.markFailed(created.id, `dispatch failed: ${message}`, true);
      throw e;
    }

    return { jobId: created.id, status: JobStatus.PENDING };
  }

  async getForUser(jobId: string, userId: number): Promise<JobResponseDto> {
    return this.state.getForUser(jobId, userId);
  }
}
