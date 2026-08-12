import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin/audit-log.service';
import { errorName } from '../../common/errors/error-name.util';
import {
  IMAGE_OBJECT_STORE,
} from './providers/image-object-store.interface';
import type { ImageObjectStore } from './providers/image-object-store.interface';
import type { InferenceImage } from '../diagnosis/providers/inference-provider.interface';

/** N8: 캘린더 히스토리용 이미지 URL 기본 만료(초). */
export const DEFAULT_PRESIGN_EXPIRES_SECONDS = 15 * 60;

/** N10: 재시도 worker 기본 배치 크기. */
export const IMAGE_DELETE_RETRY_BATCH = 100;

/** N10: orphan 탐지 기본 dry-run(안전 기본값). cleanup은 ADMIN이 명시적으로 호출. */
export const IMAGE_ORPHAN_DETECT_PREFIX = 'diagnoses/';

/** R20: 서명에 필요한 최소 정보. `DiagnosisImage` row가 그대로 만족한다. */
export interface PresignableImage {
  s3Bucket: string;
  s3Key: string;
  contentType: string;
}

export interface PresignedImage {
  url: string;
  contentType: string;
  expiresAt: string;
}

export interface ImageDeleteRetryReport {
  scanned: number;
  deleted: number;
  failed: number;
  /** 최대 시도 횟수 초과로 이번 라운드에서 건너뛴 건수 */
  skippedMaxAttempts: number;
}

export interface ImageOrphanReport {
  dryRun: boolean;
  totalObjects: number;
  orphanCount: number;
  /** 개인정보(사용자 ID 포함) key 대신 해시 앞자리만 노출한다. */
  orphanKeyHashes: string[];
  deletedKeyHashes: string[];
}

/**
 * ImageStorageService — N3 진단 이미지 저장/삭제 + N8 presigned URL + N10 reconciliation.
 *
 * - 저장 동의가 있을 때만 put
 * - DB에는 DiagnosisImage 메타만 저장, thumbnailUri에 논리 URI
 * - 철회 시 사용자 전체 이미지 물리 삭제 + soft delete 마킹 + landmarks 제거
 * - N10: 삭제는 2단계 — DB에 pendingDeleteAt 기록 → S3 객체 삭제 → deletedAt 완료.
 *   일시적 S3/DB 장애 뒤에도 재시도 worker가 미완료 row를 자동 수렴시킨다.
 * - N10: orphan 객체(DB 메타 없는) 탐지 dry-run/정리 + 이미지 교체 시 이전 객체 정리.
 */
@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    @Inject(IMAGE_OBJECT_STORE) private readonly store: ImageObjectStore,
    private readonly config: ConfigService,
  ) {}

  private maxDeleteAttempts(): number {
    const raw = this.config.get<number>('IMAGE_DELETE_MAX_ATTEMPTS');
    return typeof raw === 'number' && raw > 0 ? raw : 10;
  }

  /**
   * 진단 이미지를 암호화 저장하고 DiagnosisImage row + thumbnailUri를 갱신한다.
   * 실패해도 진단 자체는 유지할 수 있도록 호출측에서 선택적으로 사용한다.
   * N10: 기존 이미지를 교체하는 경우 이전 객체를 정리한다(실패 시 orphan으로 남겨
   * orphan 탐지가 수렴시킨다 — 객체가 DB에 미참조되므로 안전).
   */
  async storeDiagnosisImage(params: {
    userId: number;
    diagnosisId: string;
    image: InferenceImage;
  }): Promise<{ uri: string }> {
    const previous = await this.prisma.diagnosisImage.findUnique({
      where: { diagnosisId: params.diagnosisId },
    });
    const ext = extensionFor(params.image.mimetype);
    const key = `diagnoses/${params.userId}/${params.diagnosisId}/front-${randomUUID()}.${ext}`;

    const ref = await this.store.putObject({
      key,
      body: params.image.buffer,
      contentType: params.image.mimetype,
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.diagnosisImage.upsert({
          where: { diagnosisId: params.diagnosisId },
          create: {
            id: randomUUID(),
            diagnosisId: params.diagnosisId,
            userId: params.userId,
            s3Bucket: ref.bucket,
            s3Key: ref.key,
            contentType: ref.contentType,
            sizeBytes: ref.sizeBytes,
            checksumSha256: ref.checksumSha256,
            encryption: ref.encryption,
          },
          update: {
            s3Bucket: ref.bucket,
            s3Key: ref.key,
            contentType: ref.contentType,
            sizeBytes: ref.sizeBytes,
            checksumSha256: ref.checksumSha256,
            encryption: ref.encryption,
            deletedAt: null,
            storedAt: new Date(),
          },
        });
        await tx.diagnosis.update({
          where: { id: params.diagnosisId },
          data: { thumbnailUri: ref.uri },
        });
      });
    } catch (error) {
      // 객체 업로드 후 DB 반영이 실패하면 참조 없는 개인정보 객체가 남지 않도록 보상 삭제한다.
      try {
        await this.store.deleteObject({ bucket: ref.bucket, key: ref.key });
      } catch (cleanupError) {
        this.logger.error(
          `이미지 메타데이터 저장 실패 후 객체 정리 실패 diagnosisId=${params.diagnosisId}: ${
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }`,
        );
      }
      throw error;
    }

    // N10: 이미지 교체 — 이전 객체를 정리한다. 삭제 실패는 orphan으로 수렴 대상.
    if (previous && previous.s3Key !== ref.key && !previous.deletedAt) {
      try {
        await this.store.deleteObject({
          bucket: previous.s3Bucket,
          key: previous.s3Key,
        });
      } catch (cleanupError) {
        this.logger.warn(
          `이전 이미지 객체 정리 실패(orphan 대상) diagnosisId=${params.diagnosisId}: ${
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }`,
        );
        await this.auditLog.log({
          actorId: params.userId,
          action: 'image.replace_cleanup_failed',
          targetType: 'DiagnosisImage',
          targetId: previous.id,
          result: 'failure',
          metadata: { diagnosisId: params.diagnosisId, keyHash: hashKey(previous.s3Key) },
        });
      }
    }

    await this.auditLog.log({
      actorId: params.userId,
      action: 'image.stored',
      targetType: 'Diagnosis',
      targetId: params.diagnosisId,
      result: 'success',
      metadata: {
        bucket: ref.bucket,
        keyHash: hashKey(ref.key),
        encryption: ref.encryption,
        sizeBytes: ref.sizeBytes,
        replacedPrevious: Boolean(previous && previous.s3Key !== ref.key),
      },
    });

    return { uri: ref.uri };
  }

  /**
   * N8: 진단 이미지에 대한 단기 조회 URL.
   * DiagnosisImage가 없거나 soft-deleted면 null.
   */
  async getPresignedUrlForDiagnosis(
    diagnosisId: string,
    expiresInSeconds = DEFAULT_PRESIGN_EXPIRES_SECONDS,
  ): Promise<PresignedImage | null> {
    const image = await this.prisma.diagnosisImage.findFirst({
      where: { diagnosisId, deletedAt: null },
    });
    if (!image) {
      return null;
    }
    return this.presignImage(image, expiresInSeconds);
  }

  /**
   * R20: 이미 조회해 둔 이미지 row로 URL만 만든다.
   *
   * 캘린더 히스토리는 상위 쿼리에서 `image`를 include하고도 진단마다
   * `getPresignedUrlForDiagnosis`를 불러 같은 row를 다시 읽었다(N+1). 서명은 로컬
   * 연산이라 네트워크가 필요 없으므로, row가 손에 있으면 DB 왕복이 0이어야 한다.
   */
  async presignImage(
    image: PresignableImage,
    expiresInSeconds = DEFAULT_PRESIGN_EXPIRES_SECONDS,
  ): Promise<PresignedImage> {
    const url = await this.store.getPresignedUrl({
      bucket: image.s3Bucket,
      key: image.s3Key,
      expiresInSeconds,
    });
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    return { url, contentType: image.contentType, expiresAt };
  }

  /**
   * R20: 여러 이미지를 한 번에 서명한다. 서명 실패가 목록 전체를 실패시키지 않도록
   * 실패한 항목만 null로 남긴다(기존 단건 경로도 실패 시 image=null로 응답했다).
   */
  async presignImages(
    images: PresignableImage[],
    expiresInSeconds = DEFAULT_PRESIGN_EXPIRES_SECONDS,
  ): Promise<Array<PresignedImage | null>> {
    return Promise.all(
      images.map(async (image) => {
        try {
          return await this.presignImage(image, expiresInSeconds);
        } catch (e) {
          this.logger.warn(
            `presign 실패 (keyHash=${hashKey(image.s3Key)}): ${errorName(e)}`,
          );
          return null;
        }
      }),
    );
  }

  /**
   * BE-2026-08-12: DB에 저장된 논리 URI(thumbnailUri)를 클라이언트 로드 가능한
   * 공개 URL로 변환한다. Memory는 memory:// → dev-storage http, 그 외는 그대로.
   * 진단 스냅샷 DTO가 RN Image로 로드 가능한 값을 내보내도록 보장한다.
   */
  toPublicUrl(uri: string): string {
    return this.store.toPublicUrl(uri);
  }

  /**
   * 소유권 확인 후 presigned URL 발급. 이미지 없으면 404.
   */
  async getPresignedUrlForOwnedDiagnosis(params: {
    userId: number;
    diagnosisId: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; contentType: string; expiresAt: string }> {
    const image = await this.prisma.diagnosisImage.findFirst({
      where: {
        diagnosisId: params.diagnosisId,
        userId: params.userId,
        deletedAt: null,
      },
    });
    if (!image) {
      throw new NotFoundException('저장된 진단 이미지가 없습니다');
    }
    const expiresInSeconds =
      params.expiresInSeconds ?? DEFAULT_PRESIGN_EXPIRES_SECONDS;
    const url = await this.store.getPresignedUrl({
      bucket: image.s3Bucket,
      key: image.s3Key,
      expiresInSeconds,
    });
    return {
      url,
      contentType: image.contentType,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  /**
   * N10 2단계 삭제 — 저장 동의 철회/탈퇴 시 사용자 이미지 삭제.
   *
   * 1단계: 모든 대상 row에 pendingDeleteAt 기록(재시도 worker 스캔 대상).
   * 2단계: S3 객체 삭제 → 성공 시 deletedAt 완료 마킹.
   * 실패 시 deleteAttempts/lastDeleteError를 남기고 ServiceUnavailableException을
   * 던져 호출자(철회/탈퇴)가 재시도하도록 한다. 미완료 row는 재시도 worker가 수렴시킨다.
   */
  async deleteAllForUser(userId: number): Promise<number> {
    const images = await this.prisma.diagnosisImage.findMany({
      where: { userId, deletedAt: null },
    });

    // 1단계: DB에 삭제 의도를 기록. 이후 프로세스가 죽어도 worker가 재시도한다.
    if (images.length > 0) {
      await this.prisma.diagnosisImage.updateMany({
        where: { userId, deletedAt: null, pendingDeleteAt: null },
        data: { pendingDeleteAt: new Date() },
      });
    }

    let deleted = 0;
    let failed = 0;
    for (const img of images) {
      try {
        await this.store.deleteObject({ bucket: img.s3Bucket, key: img.s3Key });
      } catch (e) {
        failed += 1;
        const attempts = img.deleteAttempts + 1;
        await this.prisma.diagnosisImage.update({
          where: { id: img.id },
          data: {
            deleteAttempts: attempts,
            lastDeleteError: truncateError(e),
          },
        });
        this.logger.warn(
          `이미지 객체 삭제 실패(재시도 대상) diagnosisId=${img.diagnosisId} attempts=${attempts}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        await this.auditLog.log({
          actorId: userId,
          action: 'image.delete_on_revoke_failed',
          targetType: 'DiagnosisImage',
          targetId: img.id,
          result: 'failure',
          metadata: { diagnosisId: img.diagnosisId, deleteAttempts: attempts },
        });
        // 객체가 실제로 남아 있으므로 DB 참조(pendingDeleteAt)를 유지해 재시도할 수 있게 한다.
        continue;
      }

      // 2단계: 객체 삭제 성공 → DB 완료 마킹.
      await this.prisma.$transaction(async (tx) => {
        await tx.diagnosisImage.update({
          where: { id: img.id },
          data: { deletedAt: new Date(), pendingDeleteAt: null, lastDeleteError: null },
        });
        await tx.diagnosis.update({
          where: { id: img.diagnosisId },
          data: { thumbnailUri: null, landmarks: Prisma.JsonNull },
        });
      });
      deleted += 1;
      await this.auditLog.log({
        actorId: userId,
        action: 'image.deleted_on_revoke',
        targetType: 'DiagnosisImage',
        targetId: img.id,
        result: 'success',
        metadata: { diagnosisId: img.diagnosisId },
      });
    }

    // 이미지가 없어도 랜드마크만 남아 있을 수 있으므로 사용자 진단 landmarks를 비운다.
    await this.prisma.diagnosis.updateMany({
      where: { userId },
      data: { landmarks: Prisma.JsonNull },
    });

    if (failed > 0) {
      throw new ServiceUnavailableException(
        '일부 진단 이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    }

    return deleted;
  }

  /**
   * N10: 삭제 실패(pendingDeleteAt && !deletedAt) row를 재시도한다.
   * - 성공: deletedAt 완료 마킹
   * - 실패: deleteAttempts 증가 — 최대 시도 초과 시 permanent failure 감사 로그(알림 채널)
   * 운영 지표는 반환 report + 구조화 로그로 남긴다.
   */
  async retryPendingDeletes(opts?: {
    limit?: number;
  }): Promise<ImageDeleteRetryReport> {
    const limit = opts?.limit ?? IMAGE_DELETE_RETRY_BATCH;
    const pending = await this.prisma.diagnosisImage.findMany({
      where: { pendingDeleteAt: { not: null }, deletedAt: null },
      orderBy: { pendingDeleteAt: 'asc' },
      take: limit,
    });

    let deleted = 0;
    let failed = 0;
    let skippedMaxAttempts = 0;

    for (const img of pending) {
      if (img.deleteAttempts >= this.maxDeleteAttempts()) {
        skippedMaxAttempts += 1;
        continue;
      }
      try {
        await this.store.deleteObject({ bucket: img.s3Bucket, key: img.s3Key });
      } catch (e) {
        failed += 1;
        const attempts = img.deleteAttempts + 1;
        await this.prisma.diagnosisImage.update({
          where: { id: img.id },
          data: {
            deleteAttempts: attempts,
            lastDeleteError: truncateError(e),
          },
        });
        if (attempts >= this.maxDeleteAttempts()) {
          // 운영 알림: 최대 시도 초과 — 감사 로그 + error 레벨 로그(모니터링 대상).
          await this.auditLog.log({
            actorId: null,
            action: 'image.delete_permanent_failure',
            targetType: 'DiagnosisImage',
            targetId: img.id,
            result: 'failure',
            metadata: { diagnosisId: img.diagnosisId, deleteAttempts: attempts },
          });
          this.logger.error(
            `이미지 삭제 최대 시도 초과 — 관리자 재처리 필요 diagnosisId=${img.diagnosisId} attempts=${attempts}`,
          );
        }
        continue;
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.diagnosisImage.update({
          where: { id: img.id },
          data: { deletedAt: new Date(), pendingDeleteAt: null, lastDeleteError: null },
        });
        await tx.diagnosis.update({
          where: { id: img.diagnosisId },
          data: { thumbnailUri: null, landmarks: Prisma.JsonNull },
        });
      });
      deleted += 1;
    }

    const report: ImageDeleteRetryReport = {
      scanned: pending.length,
      deleted,
      failed,
      skippedMaxAttempts,
    };
    this.logger.log(`retryPendingDeletes ${JSON.stringify(report)}`);
    return report;
  }

  /**
   * N10: DB 메타데이터 없는 orphan 객체 탐지/정리.
   * 기본 dryRun=true(안전). ADMIN이 dryRun=false로 호출하면 실제 삭제한다.
   * DB의 soft-deleted row(deletedAt 있음)는 감사 보존 대상이므로 orphan으로 간주하지 않는다.
   */
  async detectOrphans(opts?: { dryRun?: boolean; limit?: number }): Promise<ImageOrphanReport> {
    const dryRun = opts?.dryRun ?? true;
    const bucket = this.store.bucket;
    const storeKeys = await this.store.listObjects({
      bucket,
      prefix: IMAGE_ORPHAN_DETECT_PREFIX,
    });
    const dbRows = await this.prisma.diagnosisImage.findMany({
      select: { s3Key: true },
    });
    const dbKeys = new Set(dbRows.map((r) => r.s3Key));

    const orphans = storeKeys.filter((k) => !dbKeys.has(k));
    const deletedKeys: string[] = [];

    if (!dryRun && orphans.length > 0) {
      const targets = opts?.limit ? orphans.slice(0, opts.limit) : orphans;
      for (const key of targets) {
        try {
          await this.store.deleteObject({ bucket, key });
          deletedKeys.push(key);
        } catch (e) {
          this.logger.warn(
            `orphan 객체 삭제 실패 keyHash=${hashKey(key)}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }
    }

    await this.auditLog.log({
      actorId: null,
      action: dryRun ? 'image.orphan_scan' : 'image.orphan_cleanup',
      targetType: 'DiagnosisImage',
      result: 'success',
      metadata: {
        dryRun,
        totalObjects: storeKeys.length,
        orphanCount: orphans.length,
        deletedCount: deletedKeys.length,
      },
    });

    const report: ImageOrphanReport = {
      dryRun,
      totalObjects: storeKeys.length,
      orphanCount: orphans.length,
      orphanKeyHashes: orphans.slice(0, 50).map(hashKey),
      deletedKeyHashes: deletedKeys.map(hashKey),
    };
    this.logger.log(`detectOrphans ${JSON.stringify(report)}`);
    return report;
  }
}

function extensionFor(mimetype: string): string {
  switch (mimetype) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

/** key 전체는 노출하지 않고 해시 앞자리만 로그/감사에 사용한다. */
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function truncateError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 500);
}
