import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import { Role } from '../../common/enums/role.enum';
import {
  AdminUserItemDto,
  AdminUserListResponseDto,
} from './dto/admin-user-list.dto';
import { ChangeRoleDto } from './dto/change-role.dto';

/**
 * ADMIN 운영 서비스.
 *
 * decision.md T3-05: Role 기반 유지. Permission은 3개+ 독립 action 시 도입.
 * 첫 ADMIN API: 사용자 목록 조회, 사용자 역할 변경.
 * 모든 행위는 AuditLogService로 감사 로그에 기록된다.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async listUsers(): Promise<AdminUserListResponseDto> {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
    });

    return {
      users: users.map((u) => ({
        id: u.id,
        phoneNumber: u.phoneNumber,
        name: u.name,
        birthDate: u.birthDate.toISOString().slice(0, 10),
        role: u.role as Role,
        createdAt: u.createdAt.toISOString(),
      })),
      total: users.length,
    };
  }

  async changeRole(
    dto: ChangeRoleDto,
    actorId: number,
    ipAddress?: string,
  ): Promise<AdminUserItemDto> {
    // 자기 자신의 역할은 어떤 방향으로든 변경 금지.
    // (ADMIN 승격뿐 아니라 ADMIN→USER 강등도 차단)
    if (dto.userId === actorId) {
      throw new BadRequestException(
        '자기 자신의 권한은 이 API로 변경할 수 없습니다',
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!target) {
      throw new NotFoundException('대상 사용자를 찾을 수 없습니다');
    }

    const previousRole = target.role as Role;
    if (previousRole === dto.role) {
      throw new BadRequestException('이미 동일한 역할입니다');
    }

    const updated = await this.prisma.user.update({
      where: { id: dto.userId },
      data: { role: dto.role },
    });

    await this.auditLog.log({
      actorId,
      action: 'user_role_changed',
      targetType: 'User',
      targetId: String(dto.userId),
      result: 'success',
      metadata: { from: previousRole, to: dto.role },
      ipAddress: ipAddress ?? null,
    });

    this.logger.log(
      `ADMIN ${actorId} changed user ${dto.userId} role ${previousRole} -> ${dto.role}`,
    );

    return {
      id: updated.id,
      phoneNumber: updated.phoneNumber,
      name: updated.name,
      birthDate: updated.birthDate.toISOString().slice(0, 10),
      role: updated.role as Role,
      createdAt: updated.createdAt.toISOString(),
    };
  }
}
