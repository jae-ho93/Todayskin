import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationJobHandler } from './notification.job-handler';
import { JobsModule } from '../jobs/jobs.module';

/**
 * NotificationModule — T11 알림 설정 + N4 비동기 발송 enqueue.
 * R12: JobsModule 의존은 단방향이다(forwardRef 불필요). 잡 핸들러는 이 모듈이 등록한다.
 */
@Module({
  imports: [JobsModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationJobHandler],
  exports: [NotificationService],
})
export class NotificationModule {}
