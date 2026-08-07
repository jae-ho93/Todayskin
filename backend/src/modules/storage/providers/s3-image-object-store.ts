import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ImageObjectStore,
  StoredImageRef,
} from './image-object-store.interface';

/**
 * AWS S3 객체 저장소 — SSE-S3(AES256) 또는 SSE-KMS.
 * ARCHITECTURE.md: 동의한 이미지만 암호화 저장.
 */
export class S3ImageObjectStore implements ImageObjectStore {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly kmsKeyId?: string;

  constructor(opts: {
    bucket: string;
    region: string;
    kmsKeyId?: string;
  }) {
    this.bucketName = opts.bucket;
    this.kmsKeyId = opts.kmsKeyId;
    this.client = new S3Client({ region: opts.region });
  }

  get bucket(): string {
    return this.bucketName;
  }

  async putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredImageRef> {
    const checksumSha256 = createHash('sha256').update(params.body).digest('hex');
    const encryption = this.kmsKeyId ? 'aws:kms' : 'AES256';

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        ServerSideEncryption: this.kmsKeyId
          ? ServerSideEncryption.aws_kms
          : ServerSideEncryption.AES256,
        ...(this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
        // 원본 얼굴 이미지는 공개 ACL을 절대 쓰지 않는다.
        Metadata: {
          checksumSha256,
        },
      }),
    );

    return {
      bucket: this.bucket,
      key: params.key,
      contentType: params.contentType,
      sizeBytes: params.body.length,
      checksumSha256,
      encryption,
      uri: `s3://${this.bucket}/${params.key}`,
    };
  }

  async deleteObject(params: { bucket: string; key: string }): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
      }),
    );
  }

  async getPresignedUrl(params: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
    });
  }

  /**
   * N10: bucket 내 모든 객체 key를 나열한다(prefix 필터, 페이징 처리).
   * orphan 객체 탐지 dry-run/정리에 사용.
   */
  async listObjects(params: { bucket: string; prefix?: string }): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const resp = await this.client.send(
        new ListObjectsV2Command({
          Bucket: params.bucket,
          Prefix: params.prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of resp.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  }
}
