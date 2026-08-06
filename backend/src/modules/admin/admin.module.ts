import { Module, forwardRef } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditLogService } from './audit-log.service';
import { SoftDeleteModule } from '../../common/soft-delete/soft-delete.module';

/**
 * ADMIN 운영 모듈.
 *
 * decision.md T3-05: 첫 ADMIN 운영 API + @Roles(Role.ADMIN) + 감사 로그.
 * RolesGuard는 AuthModule에서 전역/재사용 가능하나, AdminModule에서
 * 컨트롤러 레벨 @UseGuards로 명시 적용한다.
 */
@Module({
  imports: [forwardRef(() => SoftDeleteModule)],
  controllers: [AdminController],
  providers: [AdminService, AuditLogService],
  exports: [AuditLogService],
})
export class AdminModule {}
