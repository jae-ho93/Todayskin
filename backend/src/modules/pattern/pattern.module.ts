import { Module } from '@nestjs/common';
import { PatternController } from './pattern.controller';
import { PatternService } from './pattern.service';
import { PatternJobHandler } from './pattern.job-handler';
import { JobsModule } from '../jobs/jobs.module';

/**
 * PatternModule — T10 개인 패턴 + N4 비동기 enqueue.
 * R12: JobsModule 의존은 단방향이다(forwardRef 불필요). 잡 핸들러는 이 모듈이 등록한다.
 */
@Module({
  imports: [JobsModule],
  controllers: [PatternController],
  providers: [PatternService, PatternJobHandler],
  exports: [PatternService],
})
export class PatternModule {}
