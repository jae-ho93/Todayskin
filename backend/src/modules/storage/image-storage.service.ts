import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin/audit-log.service';
import {
  IMAGE_OBJECT_STORE,
} from './providers/image-object-store.interface';
import type { ImageObjectStore } from './providers/image-object-store.interface';
import type { InferenceImage } from '../diagnosis/providers/inference-provider.interface';

/** N8: 캘린더 히스토리용 이미지 URL 기본 만료(초). */
export const DEFAULT_PRESIGN_EXPIRES_SECONDS = 15 * 60;

/**
 * ImageStorageService — N3 진단 이미지 저장/삭제 + N8 presigned URL.
 *
 * - 저장 동의가 있을 때만 put
 * - DB에는 DiagnosisImage 메타만 저장, thumbnailUri에 논리 URI
 * - 철회 시 사용자 전체 이미지 물리 삭제 + soft delete 마킹 + landmarks 제거
 * - 조회 시 S3/Memory presigned URL 발급
 */
@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    @Inject(IMAGE_OBJECT_STORE) private readonly store: ImageObjectStore,
  ) {}

  /**
   * 진단 이미지를 암호화 저장하고 DiagnosisImage row + thumbnailUri를 갱신한다.
   * 실패해도 진단 자체는 유지할 수 있도록 호출측에서 선택적으로 사용한다.
   */
  async storeDiagnosisImage(params: {
    userId: number;
    diagnosisId: string;
    image: InferenceImage;
  }): Promise<{ uri: string }> {
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

    await this.auditLog.log({
      actorId: params.userId,
      action: 'image.stored',
      targetType: 'Diagnosis',
      targetId: params.diagnosisId,
      result: 'success',
      metadata: {
        bucket: ref.bucket,
        keyHash: createHash('sha256').update(ref.key).digest('hex').slice(0, 16),
        encryption: ref.encryption,
        sizeBytes: ref.sizeBytes,
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
  ): Promise<{
    url: string;
    contentType: string;
    expiresAt: string;
  } | null> {
    const image = await this.prisma.diagnosisImage.findFirst({
      where: { diagnosisId, deletedAt: null },
    });
    if (!image) {
      return null;
    }
    const url = await this.store.getPresignedUrl({
      bucket: image.s3Bucket,
      key: image.s3Key,
      expiresInSeconds,
    });
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    return { url, contentType: image.contentType, expiresAt };
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
   * 저장 동의 철회 시: 사용자 이미지를 모두 S3/메모리에서 삭제하고
   * DiagnosisImage.deletedAt + Diagnosis.thumbnailUri/landmarks=null 처리.
   */
  async deleteAllForUser(userId: number): Promise<number> {
    const images = await this.prisma.diagnosisImage.findMany({
      where: { userId, deletedAt: null },
    });
    let deleted = 0;
    let failed = 0;
    for (const img of images) {
      try {
        await this.store.deleteObject({ bucket: img.s3Bucket, key: img.s3Key });
      } catch (e) {
        failed += 1;
        this.logger.warn(
          `이미지 객체 삭제 실패 diagnosisId=${img.diagnosisId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        await this.auditLog.log({
          actorId: userId,
          action: 'image.delete_on_revoke_failed',
          targetType: 'DiagnosisImage',
          targetId: img.id,
          result: 'failure',
          metadata: { diagnosisId: img.diagnosisId },
        });
        // 객체가 실제로 남아 있으므로 DB 참조를 유지해 재시도할 수 있게 한다.
        continue;
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.diagnosisImage.update({
          where: { id: img.id },
          data: { deletedAt: new Date() },
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
