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
  /** N44: 탈퇴 시점에 물리 삭제한 진단 수(익명 보존하지 않는다). */
  diagnosesDeleted: number;
  imagesDeleted: number;
}

export interface PurgeResult {
  usersPurged: number;
  /** N44: 구 정책으로 남아 있던 잔존 진단을 purge 시 정리한 수. 정상 흐름에서는 0이다. */
  diagnosesPurged: number;
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
   * 회원 탈퇴.
   * 1) 원본 이미지 물리 삭제
   * 2) 진단 결과 물리 삭제 (N44 — 익명 보존하지 않는다)
   * 3) User PII 스크럽 + Soft Delete
   * 4) RefreshSession 전부 revoke
   *
   * N44: 진단은 유예 없이 탈퇴 시점에 지운다. 유예(purgeAfter)는 오탈퇴 복구를
   * 위한 것인데, 이미지가 이미 물리 삭제되고 PII도 스크럽된 뒤라 복원할 것이 없고
   * 복원 경로도 없다. 유예는 파기를 미루기만 할 뿐 아무것도 돌려주지 않는다.
   * User row는 계정 껍데기로 유예를 유지한다 — 탈퇴 사실 자체는 분쟁 대응에 쓰인다.
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

    let diagnosesDeleted = 0;
    await this.prisma.$transaction(async (tx) => {
      // 추천은 diagnosisId가 SetNull이라 진단만 지우면 남는다. userId Cascade가
      // User 물리 삭제 시점에 정리하지만, 그때까지 얼굴 분석에서 나온 문장이
      // 그대로 남아 있게 된다. 여기서 함께 지운다.
      await tx.recommendation.deleteMany({ where: { userId } });
      // SkinMetric·DiagnosisImage는 Cascade로 함께 사라진다.
      const removed = await tx.diagnosis.deleteMany({ where: { userId } });
      diagnosesDeleted = removed.count;

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
        diagnosesDeleted,
        imagesDeleted,
      },
    });

    this.logger.log(
      `User ${userId} withdrawn; purgeAfter=${purgeAfter.toISOString()} diagnosesDeleted=${diagnosesDeleted}`,
    );

    return {
      userId,
      deletedAt: now.toISOString(),
      purgeAfter: purgeAfter.toISOString(),
      diagnosesDeleted,
      imagesDeleted,
    };
  }

  /**
   * purgeAfter가 지난 Soft Delete User를 물리 삭제.
   *
   * N44: 진단은 탈퇴 시점에 이미 지워졌으므로 정상 흐름에서는 남아 있지 않다.
   * 그래도 여기서 한 번 더 지운다 — 구 정책으로 탈퇴한 사용자의 행이 남아 있고,
   * FK가 SetNull이라 그냥 User만 지우면 그 행들이 주인 없는 상태로 영원히 남는다.
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
    let diagnosesPurged = 0;

    for (const u of expired) {
      const removed = await this.prisma.$transaction(async (tx) => {
        await tx.recommendation.deleteMany({ where: { userId: u.id } });
        const { count } = await tx.diagnosis.deleteMany({ where: { userId: u.id } });
        await tx.user.delete({ where: { id: u.id } });
        return count;
      });
      usersPurged += 1;
      diagnosesPurged += removed;
      await this.auditLog.log({
        actorId: null,
        action: 'user.purged',
        targetType: 'User',
        targetId: String(u.id),
        result: 'success',
        metadata: { diagnosesPurged: removed },
      });
    }

    this.logger.log(
      `Purge complete: usersPurged=${usersPurged} diagnosesPurged=${diagnosesPurged}`,
    );
    return { usersPurged, diagnosesPurged };
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
