import { DevStorageController } from './dev-storage.controller';
import { MemoryImageObjectStore } from './providers/memory-image-object-store';
import type { ImageObjectStore } from './providers/image-object-store.interface';

function mockRes() {
  const res: {
    status: (code: number) => typeof res;
    setHeader: (name: string, value: string) => unknown;
    send: (body: unknown) => unknown;
    end: () => unknown;
  } = {
    status: jest.fn(() => res),
    setHeader: jest.fn(),
    send: jest.fn(),
    end: jest.fn(),
  };
  return res;
}

describe('DevStorageController', () => {
  it('Memory 스토어 저장 이미지를 바이트로 응답한다', async () => {
    const store = new MemoryImageObjectStore('test-bucket');
    await store.putObject({
      key: 'diagnoses/1/front.jpg',
      body: Buffer.from('jpeg-bytes'),
      contentType: 'image/jpeg',
    });
    const controller = new DevStorageController(store);
    const res = mockRes();

    await controller.serve('test-bucket', ['diagnoses', '1', 'front.jpg'], res as never);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('jpeg-bytes'));
  });

  it('없는 키면 404', async () => {
    const store = new MemoryImageObjectStore('test-bucket');
    const controller = new DevStorageController(store);
    const res = mockRes();

    await controller.serve('test-bucket', ['missing.jpg'], res as never);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalled();
  });

  it('Memory 스토어가 아니면(S3 등) 항상 404', async () => {
    const fakeStore = {} as ImageObjectStore;
    const controller = new DevStorageController(fakeStore);
    const res = mockRes();

    await controller.serve('bucket', ['key.jpg'], res as never);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalled();
  });
});
