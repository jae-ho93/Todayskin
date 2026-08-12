import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobHandlerRegistry } from '../jobs/handlers/job-handler.registry';
import { optionalString, toJobError } from '../jobs/handlers/job-error';
import { JobType } from '../jobs/enums/job-type.enum';
import { NotificationService } from './notification.service';

/** R12: 알림 발송 잡 핸들러(T11). */
@Injectable()
export class NotificationJobHandler implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      JobType.NOTIFICATION_SEND,
      async (_jobId, userId, payload) => {
        try {
          const result = await this.notifications.send(
            userId,
            optionalString(payload, 'kind') ?? '',
            {
              title: optionalString(payload, 'title'),
              body: optionalString(payload, 'body'),
            },
          );
          return { notification: result };
        } catch (e) {
          throw toJobError(e);
        }
      },
    );
  }
}
