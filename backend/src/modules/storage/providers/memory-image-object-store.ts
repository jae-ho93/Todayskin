import { createHash } from 'node:crypto';
import {
  ImageObjectStore,
  StoredImageRef,
} from './image-object-store.interface';

/**
 * 개발/테스트용 인메모리 객체 저장소.
 * S3_BUCKET 미설정 시 사용. 프로세스 메모리에만 보관한다.
 */
export class MemoryImageObjectStore implements ImageObjectStore {
  private readonly objects = new Map<string, Buffer>();
  readonly bucket: string;

  constructor(bucket = 'todayskin-local') {
    this.bucket = bucket;
  }

  async putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredImageRef> {
    const checksumSha256 = createHash('sha256').update(params.body).digest('hex');
    this.objects.set(`${this.bucket}/${params.key}`, Buffer.from(params.body));
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
    const expiresAt = Date.now() + params.expiresInSeconds * 1000;
    return `memory://${params.bucket}/${params.key}?expires=${expiresAt}`;
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
