import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminModule } from '../admin/admin.module';
import { DevStorageController } from './dev-storage.controller';
import { ImageStorageService } from './image-storage.service';
import { ImageReconciliationScheduler } from './image-reconciliation.scheduler';
import { IMAGE_OBJECT_STORE } from './providers/image-object-store.interface';
import { MemoryImageObjectStore } from './providers/memory-image-object-store';
import { S3ImageObjectStore } from './providers/s3-image-object-store';

/**
 * StorageModule — N3 이미지 객체 저장.
 *
 * - S3_BUCKET 설정 시 실제 S3(SSE)
 * - 미설정 + non-production: MemoryImageObjectStore
 * - production + 미설정: 애플리케이션 시작 실패(Memory fallback 금지)
 */
@Module({
  imports: [AdminModule],
  controllers: [DevStorageController],
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
            'production에서 S3_BUCKET이 비어 있습니다. 개인정보 이미지의 Memory fallback은 허용되지 않습니다.',
          );
          throw new Error('S3_BUCKET is required in production');
        }

        logger.warn('S3_BUCKET 미설정 — MemoryImageObjectStore 사용 (개발/테스트)');
        const port = config.get<number>('PORT', 3000);
        // 개발 서빙 엔드포인트(dev-storage)의 origin. 실기기에서는 127.0.0.1이 기기 자신을
        // 가리키므로 .env의 DEV_STORAGE_BASE_URL(예: http://192.168.x.x:3000)로 맞춘다.
        const devBaseUrl =
          config.get<string>('DEV_STORAGE_BASE_URL') ?? `http://127.0.0.1:${port}`;
        return new MemoryImageObjectStore('todayskin-local', devBaseUrl);
      },
    },
    ImageStorageService,
    ImageReconciliationScheduler,
  ],
  exports: [ImageStorageService, IMAGE_OBJECT_STORE],
})
export class StorageModule {}
