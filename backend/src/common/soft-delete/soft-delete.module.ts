import { Module, forwardRef } from '@nestjs/common';
import { SoftDeleteService } from './soft-delete.service';
import { SoftDeletePurgeScheduler } from './soft-delete-purge.scheduler';
import { StorageModule } from '../../modules/storage/storage.module';
import { AdminModule } from '../../modules/admin/admin.module';

@Module({
  imports: [forwardRef(() => StorageModule), forwardRef(() => AdminModule)],
  providers: [SoftDeleteService, SoftDeletePurgeScheduler],
  exports: [SoftDeleteService],
})
export class SoftDeleteModule {}
