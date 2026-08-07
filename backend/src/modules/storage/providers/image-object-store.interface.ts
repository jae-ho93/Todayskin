/**
 * 이미지 저장 추상화.
 * 운영: S3 SSE, 개발/테스트: 인메모리 mock.
 */
export interface StoredImageRef {
  bucket: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  encryption: string;
  /** DB thumbnailUri에 넣을 논리 URI */
  uri: string;
}

export interface ImageObjectStore {
  /** N10: orphan 탐지용 — 현재 store가 사용하는 bucket 식별자. */
  readonly bucket: string;

  putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredImageRef>;

  deleteObject(params: { bucket: string; key: string }): Promise<void>;

  /**
   * N8: 동의된 이미지 조회용 단기 URL.
   * S3는 GetObject presigned URL, Memory는 테스트용 합성 URL을 반환한다.
   */
  getPresignedUrl(params: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string>;

  /**
   * N10: bucket 내 객체 key 목록 반환(prefix 필터).
   * DB 메타데이터 없는 orphan 객체 탐지·정리에 사용한다.
   */
  listObjects(params: { bucket: string; prefix?: string }): Promise<string[]>;
}

export const IMAGE_OBJECT_STORE = Symbol('IMAGE_OBJECT_STORE');
