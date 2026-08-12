import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobHandlerRegistry } from '../jobs/handlers/job-handler.registry';
import { toJobError } from '../jobs/handlers/job-error';
import { JobType } from '../jobs/enums/job-type.enum';
import { PatternService } from './pattern.service';

/** R12: 개인 패턴 분석 잡 핸들러(T10). payload 없이 userId만 사용한다. */
@Injectable()
export class PatternJobHandler implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly pattern: PatternService,
  ) {}

  onModuleInit(): void {
    this.registry.register(JobType.PATTERN_ANALYZE, async (_jobId, userId) => {
      try {
        const summary = await this.pattern.getPattern(userId);
        return { pattern: summary };
      } catch (e) {
        throw toJobError(e);
      }
    });
  }
}
