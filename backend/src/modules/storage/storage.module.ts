import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminModule } from '../admin/admin.module';
import { ImageStorageService } from './image-storage.service';
import { IMAGE_OBJECT_STORE } from './providers/image-object-store.interface';
import { MemoryImageObjectStore } from './providers/memory-image-object-store';
import { S3ImageObjectStore } from './providers/s3-image-object-store';

/**
 * StorageModule — N3 이미지 객체 저장.
 *
 * - S3_BUCKET 설정 시 실제 S3(SSE)
 * - 미설정 + non-production: MemoryImageObjectStore
 * - production + 미설정: Memory 금지. 저장 시도는 서비스에서 실패 가능하도록
 *   memory를 쓰되 경고 로그 (동의 저장 경로에서 운영 설정 누락을 드러냄)
 */
@Module({
  imports: [AdminModule],
  providers: [
    {
      provide: IMAGE_OBJECT_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('StorageModule');
        const bucket = config.get<string>('S3_BUCKET', '');
        const region = config.get<string>('AWS_REGION', 'ap-northeast-2');
        const kmsKeyId = config.get<string>('S3_KMS_KEY_ID', '') || undefined;
        const isProduction = config.get<string>('NODE_ENV') === 'production';

        if (bucket) {
          logger.log(`S3ImageObjectStore 사용 bucket=${bucket} region=${region}`);
          return new S3ImageObjectStore({ bucket, region, kmsKeyId });
        }

        if (isProduction) {
          logger.error(
            'production에서 S3_BUCKET이 비어 있습니다. 이미지 저장은 Memory fallback으로 동작하지만 운영 배포 전 반드시 S3를 설정하세요.',
          );
        } else {
          logger.warn('S3_BUCKET 미설정 — MemoryImageObjectStore 사용 (개발/테스트)');
        }
        return new MemoryImageObjectStore('todayskin-local');
      },
    },
    ImageStorageService,
  ],
  exports: [ImageStorageService, IMAGE_OBJECT_STORE],
})
export class StorageModule {}
