import { ServiceUnavailableException } from '@nestjs/common';
import { ImageStorageService } from './image-storage.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ImageStorageService', () => {
  let prisma: Record<string, any>;
  let auditLog: { log: jest.Mock };
  let store: {
    putObject: jest.Mock;
    deleteObject: jest.Mock;
    getPresignedUrl: jest.Mock;
  };
  let service: ImageStorageService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      diagnosisImage: {
        findMany: jest.fn(),
      },
      diagnosis: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    store = {
      putObject: jest.fn(),
      deleteObject: jest.fn(),
      getPresignedUrl: jest.fn(),
    };
    service = new ImageStorageService(
      prisma as never,
      auditLog as never,
      store as never,
    );
  });

  it('객체 업로드 후 DB 저장이 실패하면 업로드 객체를 보상 삭제한다', async () => {
    store.putObject.mockResolvedValue({
      bucket: 'bucket',
      key: 'diagnoses/1/snap-1/front.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 4,
      checksumSha256: 'checksum',
      encryption: 'AES256',
      uri: 's3://bucket/diagnoses/1/snap-1/front.jpg',
    });
    prisma.$transaction.mockRejectedValue(new Error('db unavailable'));

    await expect(
      service.storeDiagnosisImage({
        userId: 1,
        diagnosisId: 'snap-1',
        image: {
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
          mimetype: 'image/jpeg',
          size: 4,
        },
      }),
    ).rejects.toThrow('db unavailable');

    expect(store.deleteObject).toHaveBeenCalledWith({
      bucket: 'bucket',
      key: 'diagnoses/1/snap-1/front.jpg',
    });
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('객체 삭제 실패 시 DB 참조를 유지하고 재시도 가능한 오류를 반환한다', async () => {
    prisma.diagnosisImage.findMany.mockResolvedValue([
      {
        id: 'image-1',
        diagnosisId: 'snap-1',
        userId: 1,
        s3Bucket: 'bucket',
        s3Key: 'diagnoses/1/snap-1/front.jpg',
      },
    ]);
    store.deleteObject.mockRejectedValue(new Error('s3 unavailable'));

    await expect(service.deleteAllForUser(1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.diagnosis.updateMany).toHaveBeenCalledWith({
      where: { userId: 1 },
      data: { landmarks: expect.anything() },
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'image.delete_on_revoke_failed',
        result: 'failure',
      }),
    );
  });
});
