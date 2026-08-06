import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { StorageModule } from '../storage/storage.module';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

/**
 * ConsentModule — N3 동의 registry·게이트·철회 정책.
 * Diagnosis/Recommendation에서 ConsentService를 주입받는다.
 */
@Module({
  imports: [AdminModule, StorageModule],
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
