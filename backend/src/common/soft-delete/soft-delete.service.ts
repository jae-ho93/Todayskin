import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ImageStorageService } from '../../modules/storage/image-storage.service';
import { AuditLogService } from '../../modules/admin/audit-log.service';
import {
  SOFT_DELETE_RETENTION_DAYS_DEFAULT,
  anonymizedBirthDate,
  anonymizedDisplayName,
  anonymizedPhone,
  computePurgeAfter,
  notDeletedWhere,
} from './soft-delete.policy';

export interface SoftDeleteResult {
  userId: number;
  deletedAt: string;
  purgeAfter: string;
  diagnosesSoftDeleted: number;
  imagesDeleted: number;
}

export interface PurgeResult {
  usersPurged: number;
  diagnosesDetached: number;
}

/**
 * SoftDeleteService — 탈퇴 Soft Delete, 익명화, purge.
 */
@Injectable()
export class SoftDeleteService {
  private readonly logger = new Logger(SoftDeleteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly imageStorage: ImageStorageService,
    private readonly auditLog: AuditLogService,
  ) {}

  private retentionDays(): number {
    const raw = this.config.get<number>('SOFT_DELETE_RETENTION_DAYS');
    return typeof raw === 'number' && raw > 0
      ? raw
      : SOFT_DELETE_RETENTION_DAYS_DEFAULT;
  }

  /**
   * 회원 탈퇴 Soft Delete.
   * 1) 원본 이미지 물리 삭제
   * 2) 진단 Soft Delete + 익명화
   * 3) User PII 스크럽 + Soft Delete
   * 4) RefreshSession 전부 revoke
   */
  async withdrawUser(userId: number, actorId?: number): Promise<SoftDeleteResult> {
    const user = await this.prisma.user.findFirst({
      where: notDeletedWhere({ id: userId }),
    });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }

    const now = new Date();
    const purgeAfter = computePurgeAfter(now, this.retentionDays());

    const imagesDeleted = await this.imageStorage.deleteAllForUser(userId);

    const diagnoses = await this.prisma.diagnosis.findMany({
      where: notDeletedWhere({ userId }),
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (diagnoses.length > 0) {
        await tx.diagnosis.updateMany({
          where: { userId, deletedAt: null },
          data: {
            deletedAt: now,
            purgeAfter,
            anonymizedAt: now,
            thumbnailUri: null,
          },
        });
      }

      await tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          purgeAfter,
          phoneNumber: anonymizedPhone(userId),
          name: anonymizedDisplayName(),
          birthDate: anonymizedBirthDate(),
          gender: null,
        },
      });
    });

    await this.auditLog.log({
      actorId: actorId ?? userId,
      action: 'user.soft_deleted',
      targetType: 'User',
      targetId: String(userId),
      result: 'success',
      metadata: {
        purgeAfter: purgeAfter.toISOString(),
        diagnosesSoftDeleted: diagnoses.length,
        imagesDeleted,
      },
    });

    this.logger.log(
      `User ${userId} soft-deleted; purgeAfter=${purgeAfter.toISOString()} diagnoses=${diagnoses.length}`,
    );

    return {
      userId,
      deletedAt: now.toISOString(),
      purgeAfter: purgeAfter.toISOString(),
      diagnosesSoftDeleted: diagnoses.length,
      imagesDeleted,
    };
  }

  /**
   * purgeAfter가 지난 Soft Delete User를 물리 삭제.
   * Diagnosis는 FK SetNull로 익명 보존된다.
   */
  async purgeExpired(now: Date = new Date()): Promise<PurgeResult> {
    const expired = await this.prisma.user.findMany({
      where: {
        deletedAt: { not: null },
        purgeAfter: { lte: now },
      },
      select: { id: true },
    });

    let usersPurged = 0;
    let diagnosesDetached = 0;

    for (const u of expired) {
      const count = await this.prisma.diagnosis.count({ where: { userId: u.id } });
      await this.prisma.user.delete({ where: { id: u.id } });
      usersPurged += 1;
      diagnosesDetached += count;
      await this.auditLog.log({
        actorId: null,
        action: 'user.purged',
        targetType: 'User',
        targetId: String(u.id),
        result: 'success',
        metadata: { diagnosesDetached: count },
      });
    }

    this.logger.log(
      `Purge complete: usersPurged=${usersPurged} diagnosesDetached=${diagnosesDetached}`,
    );
    return { usersPurged, diagnosesDetached };
  }

  /** Soft-deleted 사용자면 Conflict — 재가입은 전화번호가 스크럽되어 가능. */
  assertActiveUser(user: { deletedAt: Date | null } | null): void {
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }
    if (user.deletedAt) {
      throw new ConflictException('탈퇴한 계정입니다');
    }
  }
}
