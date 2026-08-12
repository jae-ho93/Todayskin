import { Module, forwardRef } from '@nestjs/common';
import { SoftDeleteService } from './soft-delete.service';
import { SoftDeletePurgeScheduler } from './soft-delete-purge.scheduler';
import { StorageModule } from '../../modules/storage/storage.module';
import { AdminModule } from '../../modules/admin/admin.module';
import { RetentionModule } from '../retention/retention.module';

@Module({
  imports: [
    forwardRef(() => StorageModule),
    forwardRef(() => AdminModule),
    // R11: purge 스케줄러가 보존 스윕도 함께 돌린다.
    RetentionModule,
  ],
  providers: [SoftDeleteService, SoftDeletePurgeScheduler],
  exports: [SoftDeleteService],
})
export class SoftDeleteModule {}
