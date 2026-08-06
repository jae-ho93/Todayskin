import { Module, forwardRef } from '@nestjs/common';
import { PatternController } from './pattern.controller';
import { PatternService } from './pattern.service';
import { JobsModule } from '../jobs/jobs.module';

/**
 * PatternModule — T10 개인 패턴 + N4 비동기 enqueue.
 */
@Module({
  imports: [forwardRef(() => JobsModule)],
  controllers: [PatternController],
  providers: [PatternService],
  exports: [PatternService],
})
export class PatternModule {}
