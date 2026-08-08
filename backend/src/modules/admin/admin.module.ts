import { Module, forwardRef } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditLogService } from './audit-log.service';
import { SoftDeleteModule } from '../../common/soft-delete/soft-delete.module';
import { StorageModule } from '../storage/storage.module';

/**
 * ADMIN 운영 모듈.
 *
 * ADMIN role policy: 첫 ADMIN 운영 API + @Roles(Role.ADMIN) + 감사 로그.
 * RolesGuard는 AuthModule에서 전역/재사용 가능하나, AdminModule에서
 * 컨트롤러 레벨 @UseGuards로 명시 적용한다.
 * N10: 이미지 재시도/orphan 정리 — StorageModule(ImageStorageService) 주입.
 */
@Module({
  imports: [
    forwardRef(() => SoftDeleteModule),
    // StorageModule도 AdminModule(AuditLogService)을 참조하므로 forwardRef로 순환 해소.
    forwardRef(() => StorageModule),
  ],
  controllers: [AdminController],
  providers: [AdminService, AuditLogService],
  exports: [AuditLogService],
})
export class AdminModule {}
