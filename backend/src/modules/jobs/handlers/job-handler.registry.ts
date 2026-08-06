import { Injectable, Logger } from '@nestjs/common';
import { JobType } from '../enums/job-type.enum';

export type JobHandlerFn = (
  jobId: string,
  userId: number,
  payload: Record<string, unknown>,
) => Promise<unknown>;

/**
 * JobType → 실행 핸들러 레지스트리.
 * Inline/BullMQ dispatcher가 동일 핸들러를 호출한다.
 */
@Injectable()
export class JobHandlerRegistry {
  private readonly logger = new Logger(JobHandlerRegistry.name);
  private readonly handlers = new Map<JobType, JobHandlerFn>();

  register(type: JobType, handler: JobHandlerFn): void {
    this.handlers.set(type, handler);
    this.logger.debug(`Registered job handler: ${type}`);
  }

  get(type: JobType): JobHandlerFn {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`No job handler registered for type=${type}`);
    }
    return handler;
  }
}
