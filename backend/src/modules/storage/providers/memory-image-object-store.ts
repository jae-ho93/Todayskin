import { createHash } from 'node:crypto';
import {
  ImageObjectStore,
  StoredImageRef,
} from './image-object-store.interface';

interface MemoryObject {
  body: Buffer;
  contentType: string;
}

/**
 * 개발/테스트용 인메모리 객체 저장소.
 * S3_BUCKET 미설정 시 사용. 프로세스 메모리에만 보관한다.
 *
 * presigned URL은 실기기/웹에서 React Native `Image`가 로드할 수 있도록
 * 개발용 이미지 서빙 엔드포인트(`GET /dev-storage/...`)의 http URL로 발급한다
 * (`memory://` 스킴은 RN Image가 처리하지 못해 크래시를 일으킨다).
 */
export class MemoryImageObjectStore implements ImageObjectStore {
  private readonly objects = new Map<string, MemoryObject>();
  readonly bucket: string;
  /** 개발용 서빙 엔드포인트의 origin (예: http://127.0.0.1:3000) */
  private readonly baseUrl: string;

  constructor(bucket = 'todayskin-local', baseUrl = 'http://127.0.0.1:3000') {
    this.bucket = bucket;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredImageRef> {
    const checksumSha256 = createHash('sha256').update(params.body).digest('hex');
    this.objects.set(`${this.bucket}/${params.key}`, {
      body: Buffer.from(params.body),
      contentType: params.contentType,
    });
    return {
      bucket: this.bucket,
      key: params.key,
      contentType: params.contentType,
      sizeBytes: params.body.length,
      checksumSha256,
      encryption: 'AES256',
      uri: `memory://${this.bucket}/${params.key}`,
    };
  }

  async deleteObject(params: { bucket: string; key: string }): Promise<void> {
    this.objects.delete(`${params.bucket}/${params.key}`);
  }

  async getPresignedUrl(params: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    return `${this.baseUrl}/dev-storage/${params.bucket}/${params.key}`;
  }

  /**
   * 개발용 서빙: 저장된 객체를 조회한다. 없으면 null.
   */
  async getObject(params: {
    bucket: string;
    key: string;
  }): Promise<{ body: Buffer; contentType: string } | null> {
    const obj = this.objects.get(`${params.bucket}/${params.key}`);
    return obj ? { body: obj.body, contentType: obj.contentType } : null;
  }

  /**
   * N10: bucket 내 객체 key 목록(prefix 필터). orphan 탐지 테스트용.
   */
  async listObjects(params: { bucket: string; prefix?: string }): Promise<string[]> {
    const prefixFull = `${params.bucket}/`;
    return [...this.objects.keys()]
      .filter((full) => full.startsWith(prefixFull))
      .map((full) => full.slice(prefixFull.length))
      .filter((key) => !params.prefix || key.startsWith(params.prefix));
  }

  /** 테스트용 */
  has(key: string): boolean {
    return this.objects.has(`${this.bucket}/${key}`);
  }

  size(): number {
    return this.objects.size;
  }
}
