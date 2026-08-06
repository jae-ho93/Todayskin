import { Module, forwardRef } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { JobsModule } from '../jobs/jobs.module';

/**
 * NotificationModule — T11 알림 설정 + N4 비동기 발송 enqueue.
 */
@Module({
  imports: [forwardRef(() => JobsModule)],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
