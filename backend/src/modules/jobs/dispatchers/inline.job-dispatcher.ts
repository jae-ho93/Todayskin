import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { DispatchJobInput, JobDispatcher } from './job-dispatcher.interface';
import { JobHandlerRegistry } from '../handlers/job-handler.registry';
import { JobStateService } from '../job-state.service';

/**
 * Redis 없을 때(개발/테스트) 사용하는 인프로세스 디스패처.
 * BullMQ와 동일한 PENDING → COMPLETED/FAILED 계약을 유지한다.
 * 재시도·DLQ도 JobService.markFailed 경로로 반영한다.
 */
@Injectable()
export class InlineJobDispatcher implements JobDispatcher, OnModuleDestroy {
  private readonly logger = new Logger(InlineJobDispatcher.name);
  private closed = false;

  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly jobState: JobStateService,
  ) {}

  async dispatch(input: DispatchJobInput): Promise<string | null> {
    if (this.closed) {
      throw new Error('InlineJobDispatcher already closed');
    }
    // 즉시 반환하고 백그라운드에서 처리 — API가 jobId를 먼저 돌려준다.
    setImmediate(() => {
      void this.runWithRetry(input);
    });
    return null;
  }

  private async runWithRetry(input: DispatchJobInput): Promise<void> {
    const { jobId, type, userId, payload, attempts, backoffDelayMs } = input;
    const handler = this.registry.get(type);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (this.closed) return;
      try {
        await this.jobState.markStarted(jobId, attempt);
        const result = await handler(jobId, userId, payload);
        await this.jobState.markCompleted(jobId, result);
        return;
      } catch (e) {
        lastError = e;
        this.logger.warn(
          `Inline job ${jobId} attempt ${attempt}/${attempts} failed: ${errorMessage(e)}`,
        );
        if (attempt < attempts) {
          await sleep(backoffDelayMs * 2 ** (attempt - 1));
        }
      }
    }

    await this.jobState.markFailed(jobId, errorMessage(lastError), true);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
