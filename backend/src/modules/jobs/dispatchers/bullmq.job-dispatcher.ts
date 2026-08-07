import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import type {
  DispatchJobInput,
  JobDispatcher,
  QueueMetrics,
} from './job-dispatcher.interface';
import { JobHandlerRegistry } from '../handlers/job-handler.registry';
import { JobStateService } from '../job-state.service';
import {
  JOB_POLICIES,
  QUEUE_DLQ,
  QUEUE_NOTIFICATION,
  QUEUE_PATTERN,
  QUEUE_RECOMMENDATION,
  type AppQueueName,
} from '../jobs.constants';
import { JobType } from '../enums/job-type.enum';

interface BullJobData {
  jobId: string;
  type: JobType;
  userId: number;
  payload: Record<string, unknown>;
}

/**
 * REDIS_URL이 있을 때 BullMQ Queue/Worker로 job을 처리한다.
 * 최종 실패 시 DLQ로 옮기고 AsyncJob.deadLetter=true로 표시한다.
 */
@Injectable()
export class BullMqJobDispatcher
  implements JobDispatcher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BullMqJobDispatcher.name);
  private readonly queues = new Map<AppQueueName, Queue<BullJobData>>();
  private readonly workers: Worker<BullJobData>[] = [];
  private connection: ConnectionOptions | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly registry: JobHandlerRegistry,
    private readonly jobState: JobStateService,
  ) {}

  async onModuleInit(): Promise<void> {
    const mode = this.configService.get<string>('JOB_DISPATCHER', 'auto');
    const isTest = this.configService.get<string>('NODE_ENV') === 'test';
    if (isTest || mode === 'inline') {
      // provider는 DI에 등록되지만 선택되지 않은 dispatcher는 worker를 만들지 않는다.
      this.logger.log('BullMqJobDispatcher 비활성화(Inline 사용)');
      return;
    }

    const url = this.configService.get<string>('REDIS_URL', '').trim();
    if (!url) {
      if (mode === 'bullmq') {
        throw new Error('REDIS_URL is required when JOB_DISPATCHER=bullmq');
      }
      this.logger.warn('REDIS_URL 없음 — BullMqJobDispatcher 비활성화(Inline 사용)');
      return;
    }

    // BullMQ는 maxRetriesPerRequest: null 을 요구한다.
    this.connection = { url, maxRetriesPerRequest: null };

    const workQueues: AppQueueName[] = [
      QUEUE_RECOMMENDATION,
      QUEUE_PATTERN,
      QUEUE_NOTIFICATION,
    ];

    for (const name of workQueues) {
      const policy = Object.values(JOB_POLICIES).find((p) => p.queueName === name);
      const queue = new Queue<BullJobData>(name, {
        connection: this.connection,
        defaultJobOptions: {
          attempts: policy?.attempts ?? 3,
          backoff: {
            type: 'exponential',
            delay: policy?.backoffDelayMs ?? 2_000,
          },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      });
      this.queues.set(name, queue);

      const worker = new Worker<BullJobData>(
        name,
        async (job) => this.processWorkJob(job),
        { connection: this.connection, concurrency: 2 },
      );
      worker.on('failed', (job, err) => {
        void this.onWorkFailed(job, err);
      });
      this.workers.push(worker);
    }

    const dlq = new Queue<BullJobData>(QUEUE_DLQ, {
      connection: this.connection,
      defaultJobOptions: { removeOnComplete: 500, removeOnFail: 500 },
    });
    this.queues.set(QUEUE_DLQ, dlq);

    const dlqWorker = new Worker<BullJobData>(
      QUEUE_DLQ,
      async (job) => {
        this.logger.warn(
          `DLQ received jobId=${job.data.jobId} type=${job.data.type} userId=${job.data.userId}`,
        );
      },
      { connection: this.connection, concurrency: 1 },
    );
    this.workers.push(dlqWorker);

    this.logger.log('BullMQ queues and workers started');
  }

  /**
   * N11: queue/DLQ 운영 지표 수집.
   * worker가 없으면(Inline 사용 등) null — 호출부가 수집 스킵.
   */
  async collectMetrics(): Promise<QueueMetrics | null> {
    if (this.queues.size === 0) return null;
    const queues: QueueMetrics['queues'] = {};
    for (const [name, queue] of this.queues) {
      if (name === QUEUE_DLQ) continue;
      const c = await queue.getJobCounts();
      queues[name] = {
        waiting: c.waiting ?? 0,
        active: c.active ?? 0,
        completed: c.completed ?? 0,
        failed: c.failed ?? 0,
        delayed: c.delayed ?? 0,
      };
    }
    const dlq = this.queues.get(QUEUE_DLQ);
    const dlqCounts = dlq ? await dlq.getJobCounts() : null;
    return {
      queues,
      dlqWaiting: dlqCounts?.waiting ?? 0,
    };
  }

  async dispatch(input: DispatchJobInput): Promise<string | null> {
    const queue = this.queues.get(input.queueName);
    if (!queue) {
      throw new Error(`Unknown queue: ${input.queueName}`);
    }

    const bullJob = await queue.add(
      input.type,
      {
        jobId: input.jobId,
        type: input.type,
        userId: input.userId,
        payload: input.payload,
      },
      {
        jobId: input.jobId,
        priority: input.priority,
        attempts: input.attempts,
        backoff: {
          type: 'exponential',
          delay: input.backoffDelayMs,
        },
      },
    );

    return bullJob.id ?? null;
  }

  private async processWorkJob(job: Job<BullJobData>): Promise<unknown> {
    const { jobId, type, userId, payload } = job.data;
    await this.jobState.markStarted(jobId, job.attemptsMade + 1);
    const handler = this.registry.get(type);
    const result = await handler(jobId, userId, payload);
    await this.jobState.markCompleted(jobId, result);
    return result;
  }

  private async onWorkFailed(
    job: Job<BullJobData> | undefined,
    err: Error,
  ): Promise<void> {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= maxAttempts;
    if (!exhausted) {
      this.logger.warn(
        `BullMQ job ${job.data.jobId} retry ${job.attemptsMade}/${maxAttempts}: ${err.message}`,
      );
      return;
    }

    await this.jobState.markFailed(job.data.jobId, err.message, true);
    const dlq = this.queues.get(QUEUE_DLQ);
    if (dlq) {
      await dlq.add('dead-letter', job.data, {
        jobId: `dlq-${job.data.jobId}`,
      });
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.workers.length = 0;
    this.queues.clear();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
    this.logger.log('BullMQ queues and workers stopped');
  }
}
