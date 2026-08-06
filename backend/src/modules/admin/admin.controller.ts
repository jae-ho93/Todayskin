import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import {
  AdminUserItemDto,
  AdminUserListResponseDto,
} from './dto/admin-user-list.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';

/**
 * ADMIN 운영 API.
 *
 * decision.md T3-05: @Roles(Role.ADMIN) + 감사 로그.
 * 모든 엔드포인트는 JwtAuthGuard → RolesGuard(ADMIN) 순서로 보호된다.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: '사용자 목록 조회 (ADMIN)' })
  async listUsers(): Promise<AdminUserListResponseDto> {
    return this.adminService.listUsers();
  }

  @Post('users/role')
  @ApiOperation({ summary: '사용자 역할 변경 (ADMIN, 감사 로그 기록)' })
  @HttpCode(200)
  async changeRole(
    @Body() dto: ChangeRoleDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<AdminUserItemDto> {
    return this.adminService.changeRole(dto, user.sub, req.ip);
  }

  @Post('users/:userId/soft-delete')
  @ApiOperation({ summary: '사용자 Soft Delete (ADMIN, N6)' })
  @HttpCode(200)
  async softDeleteUser(
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.adminService.softDeleteUser(Number(userId), user.sub);
  }

  @Post('purge')
  @ApiOperation({ summary: 'Soft Delete 보존 기간 만료 사용자 purge (ADMIN, N6)' })
  @HttpCode(200)
  async purge(@CurrentUser() user: JwtPayload) {
    return this.adminService.runPurge(user.sub);
  }
}
