import { MemoryImageObjectStore } from './providers/memory-image-object-store';

describe('MemoryImageObjectStore', () => {
  it('put/delete로 객체를 저장하고 제거한다', async () => {
    const store = new MemoryImageObjectStore('test-bucket');
    const body = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const ref = await store.putObject({
      key: 'diagnoses/1/front.jpg',
      body,
      contentType: 'image/jpeg',
    });

    expect(ref.bucket).toBe('test-bucket');
    expect(ref.encryption).toBe('AES256');
    expect(ref.sizeBytes).toBe(body.length);
    expect(ref.checksumSha256).toHaveLength(64);
    expect(store.has('diagnoses/1/front.jpg')).toBe(true);

    await store.deleteObject({ bucket: ref.bucket, key: ref.key });
    expect(store.has('diagnoses/1/front.jpg')).toBe(false);
  });

  it('getPresignedUrl은 만료 시각이 포함된 memory URL을 반환한다', async () => {
    const store = new MemoryImageObjectStore('test-bucket');
    const url = await store.getPresignedUrl({
      bucket: 'test-bucket',
      key: 'diagnoses/1/front.jpg',
      expiresInSeconds: 900,
    });
    expect(url.startsWith('memory://test-bucket/diagnoses/1/front.jpg?expires=')).toBe(
      true,
    );
  });
});
