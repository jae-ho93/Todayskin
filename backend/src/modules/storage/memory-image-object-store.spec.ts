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

  it('getPresignedUrl은 RN Image가 로드할 수 있는 dev-storage http URL을 반환한다', async () => {
    const store = new MemoryImageObjectStore('test-bucket', 'http://127.0.0.1:3000');
    const url = await store.getPresignedUrl({
      bucket: 'test-bucket',
      key: 'diagnoses/1/front.jpg',
      expiresInSeconds: 900,
    });
    expect(url).toBe('http://127.0.0.1:3000/dev-storage/test-bucket/diagnoses/1/front.jpg');
  });

  it('getObject는 저장된 바이트와 contentType을 반환하고, 없으면 null', async () => {
    const store = new MemoryImageObjectStore('test-bucket');
    await store.putObject({
      key: 'diagnoses/1/front.jpg',
      body: Buffer.from('jpeg-data'),
      contentType: 'image/jpeg',
    });

    const obj = await store.getObject({ bucket: 'test-bucket', key: 'diagnoses/1/front.jpg' });
    expect(obj?.body.toString()).toBe('jpeg-data');
    expect(obj?.contentType).toBe('image/jpeg');

    const missing = await store.getObject({ bucket: 'test-bucket', key: 'nope.jpg' });
    expect(missing).toBeNull();
  });
});
