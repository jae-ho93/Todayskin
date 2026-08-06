import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin/audit-log.service';
import {
  CONSENT_REGISTRY,
  getConsentDefinition,
  isKnownConsentPurpose,
} from './consent.registry';
import { ConsentPurpose } from './enums/consent-purpose.enum';
import {
  ConsentPurposeDto,
  ConsentRecordDto,
  UpsertConsentDto,
} from './dto/consent.dto';
import { ImageStorageService } from '../storage/image-storage.service';

/**
 * ConsentService — N3 동의 흐름.
 *
 * - registry 기반 purpose/version 관리
 * - 필수 동의 없으면 기능 거부 (403)
 * - 철회 시 정책 적용 (이미지 물리 삭제 / 결과 유지)
 * - 동의·철회·거부 audit log 기록
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly imageStorage: ImageStorageService,
  ) {}

  listRegistry(): ConsentPurposeDto[] {
    return CONSENT_REGISTRY.map((d) => ({
      purpose: d.purpose,
      currentVersion: d.currentVersion,
      required: d.required,
      title: d.title,
      description: d.description,
      withdrawalPolicy: d.withdrawalPolicy,
    }));
  }

  async listUserConsents(userId: number): Promise<ConsentRecordDto[]> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { purpose: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  /**
   * 동의/철회 upsert. agreed=false면 revoke 경로.
   */
  async upsert(
    userId: number,
    dto: UpsertConsentDto,
    opts?: { ipAddress?: string | null },
  ): Promise<ConsentRecordDto> {
    if (!isKnownConsentPurpose(dto.purpose)) {
      throw new BadRequestException(`알 수 없는 동의 목적: ${dto.purpose}`);
    }
    const def = getConsentDefinition(dto.purpose);
    const version = dto.version ?? def.currentVersion;
    if (dto.agreed && version !== def.currentVersion) {
      throw new BadRequestException(
        `동의 version이 최신이 아닙니다. 현재 version=${def.currentVersion}`,
      );
    }

    if (!dto.agreed) {
      return this.revoke(userId, dto.purpose, {
        ipAddress: opts?.ipAddress,
        source: dto.source,
      });
    }

    const row = await this.prisma.consentRecord.upsert({
      where: {
        userId_purpose: { userId, purpose: dto.purpose },
      },
      create: {
        userId,
        purpose: dto.purpose,
        agreed: true,
        version,
        source: dto.source ?? 'app',
        revokedAt: null,
      },
      update: {
        agreed: true,
        version,
        source: dto.source ?? 'app',
        revokedAt: null,
      },
    });

    await this.auditLog.log({
      actorId: userId,
      action: 'consent.agreed',
      targetType: 'ConsentRecord',
      targetId: String(row.id),
      result: 'success',
      metadata: { purpose: dto.purpose, version },
      ipAddress: opts?.ipAddress ?? null,
    });

    return this.toDto(row);
  }

  async revoke(
    userId: number,
    purpose: ConsentPurpose,
    opts?: { ipAddress?: string | null; source?: string },
  ): Promise<ConsentRecordDto> {
    if (!isKnownConsentPurpose(purpose)) {
      throw new BadRequestException(`알 수 없는 동의 목적: ${purpose}`);
    }
    const def = getConsentDefinition(purpose);
    const now = new Date();

    const row = await this.prisma.consentRecord.upsert({
      where: { userId_purpose: { userId, purpose } },
      create: {
        userId,
        purpose,
        agreed: false,
        version: def.currentVersion,
        source: opts?.source ?? 'app',
        revokedAt: now,
      },
      update: {
        agreed: false,
        revokedAt: now,
        source: opts?.source ?? 'app',
      },
    });

    // 철회 후속 정책
    if (def.withdrawalPolicy === 'delete_images') {
      const deleted = await this.imageStorage.deleteAllForUser(userId);
      this.logger.log(
        `동의 철회(purpose=${purpose}) — 사용자 ${userId} 이미지 ${deleted}건 삭제`,
      );
    }

    await this.auditLog.log({
      actorId: userId,
      action: 'consent.revoked',
      targetType: 'ConsentRecord',
      targetId: String(row.id),
      result: 'success',
      metadata: {
        purpose,
        withdrawalPolicy: def.withdrawalPolicy,
      },
      ipAddress: opts?.ipAddress ?? null,
    });

    return this.toDto(row);
  }

  /**
   * 활성 동의 여부. registry currentVersion 일치 + agreed + 미철회.
   */
  async hasActive(userId: number, purpose: ConsentPurpose): Promise<boolean> {
    const def = getConsentDefinition(purpose);
    const row = await this.prisma.consentRecord.findUnique({
      where: { userId_purpose: { userId, purpose } },
    });
    return Boolean(
      row &&
        row.agreed &&
        !row.revokedAt &&
        row.version === def.currentVersion,
    );
  }

  /**
   * 필수 동의 게이트. 없으면 403 + audit.
   */
  async requireActive(
    userId: number,
    purpose: ConsentPurpose,
    opts?: { ipAddress?: string | null },
  ): Promise<void> {
    const ok = await this.hasActive(userId, purpose);
    if (ok) return;

    const def = getConsentDefinition(purpose);
    await this.auditLog.log({
      actorId: userId,
      action: 'consent.denied',
      targetType: 'ConsentPurpose',
      targetId: purpose,
      result: 'failure',
      metadata: {
        requiredVersion: def.currentVersion,
        reason: 'missing_or_outdated_consent',
      },
      ipAddress: opts?.ipAddress ?? null,
    });

    throw new ForbiddenException(
      `${def.title} 동의가 필요합니다 (version ${def.currentVersion}).`,
    );
  }

  private toDto(row: {
    purpose: string;
    agreed: boolean;
    version: string;
    source: string | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ConsentRecordDto {
    const purpose = row.purpose as ConsentPurpose;
    const def = isKnownConsentPurpose(purpose)
      ? getConsentDefinition(purpose)
      : null;
    const active = Boolean(
      def &&
        row.agreed &&
        !row.revokedAt &&
        row.version === def.currentVersion,
    );
    return {
      purpose,
      agreed: row.agreed,
      version: row.version,
      source: row.source,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      active,
    };
  }
}
