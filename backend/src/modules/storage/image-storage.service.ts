import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin/audit-log.service';
import {
  IMAGE_OBJECT_STORE,
} from './providers/image-object-store.interface';
import type { ImageObjectStore } from './providers/image-object-store.interface';
import type { InferenceImage } from '../diagnosis/providers/inference-provider.interface';

/**
 * ImageStorageService — N3 진단 이미지 저장/삭제.
 *
 * - 저장 동의가 있을 때만 put
 * - DB에는 DiagnosisImage 메타만 저장, thumbnailUri에 논리 URI
 * - 철회 시 사용자 전체 이미지 물리 삭제 + soft delete 마킹
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
   * 저장 동의 철회 시: 사용자 이미지를 모두 S3/메모리에서 삭제하고
   * DiagnosisImage.deletedAt + Diagnosis.thumbnailUri=null 처리.
   */
  async deleteAllForUser(userId: number): Promise<number> {
    const images = await this.prisma.diagnosisImage.findMany({
      where: { userId, deletedAt: null },
    });
    let deleted = 0;
    for (const img of images) {
      try {
        await this.store.deleteObject({ bucket: img.s3Bucket, key: img.s3Key });
      } catch (e) {
        this.logger.warn(
          `이미지 객체 삭제 실패 diagnosisId=${img.diagnosisId}: ${(e as Error).message}`,
        );
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.diagnosisImage.update({
          where: { id: img.id },
          data: { deletedAt: new Date() },
        });
        await tx.diagnosis.update({
          where: { id: img.diagnosisId },
          data: { thumbnailUri: null },
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
