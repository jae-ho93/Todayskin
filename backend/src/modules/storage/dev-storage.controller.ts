import {
  Controller,
  Get,
  Inject,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { IMAGE_OBJECT_STORE } from './providers/image-object-store.interface';
import type { ImageObjectStore } from './providers/image-object-store.interface';
import { MemoryImageObjectStore } from './providers/memory-image-object-store';

/**
 * 개발용 이미지 서빙 엔드포인트.
 *
 * S3_BUCKET 미설정 시 사용되는 MemoryImageObjectStore의 presigned URL이
 * `memory://` 스킴이라 React Native `Image`가 처리하지 못해 크래시가 난다.
 * 메모리 스토어일 때만 이 엔드포인트의 http URL을 발급해 앱이 정상 로드하게 한다.
 * - S3 스토어(production)에서는 이 컨트롤러가 무의미하므로 항상 404
 * - 인증 없음: 개발 전용(비밀 정보 없음), production 경로는 S3가 대신함
 */
@Controller('dev-storage')
export class DevStorageController {
  constructor(
    @Inject(IMAGE_OBJECT_STORE) private readonly store: ImageObjectStore,
  ) {}

  @Get(':bucket/*path')
  async serve(
    @Param('bucket') bucket: string,
    @Param('path') path: string[],
    @Res() res: Response,
  ): Promise<void> {
    if (!(this.store instanceof MemoryImageObjectStore)) {
      res.status(404).end();
      return;
    }
    const key = path.join('/');
    const obj = await this.store.getObject({ bucket, key });
    if (!obj) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(obj.body);
  }
}
