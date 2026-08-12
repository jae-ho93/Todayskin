import { ServiceUnavailableException } from '@nestjs/common';
import { ImageStorageService } from './image-storage.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ImageStorageService', () => {
  let prisma: Record<string, any>;
  let auditLog: { log: jest.Mock };
  let store: {
    bucket: string;
    putObject: jest.Mock;
    deleteObject: jest.Mock;
    getPresignedUrl: jest.Mock;
    listObjects: jest.Mock;
  };
  let config: { get: jest.Mock };
  let service: ImageStorageService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((fn: (tx: any) => Promise<any>) =>
        fn({
          diagnosisImage: {
            upsert: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
          },
          diagnosis: { update: jest.fn().mockResolvedValue({}) },
        }),
      ),
      diagnosisImage: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      diagnosis: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    store = {
      bucket: 'todayskin-bucket',
      putObject: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      getPresignedUrl: jest.fn(),
      listObjects: jest.fn(),
    };
    config = { get: jest.fn().mockReturnValue(undefined) };
    service = new ImageStorageService(
      prisma as never,
      auditLog as never,
      store as never,
      config as never,
    );
  });

  describe('presignImages (R20 배치 서명)', () => {
    const image = (key: string) => ({
      s3Bucket: 'todayskin-bucket',
      s3Key: key,
      contentType: 'image/jpeg',
    });

    it('DB를 다시 읽지 않고 넘겨받은 row로만 서명한다', async () => {
      store.getPresignedUrl.mockImplementation(({ key }: { key: string }) =>
        Promise.resolve(`https://signed/${key}`),
      );

      const result = await service.presignImages([image('a.jpg'), image('b.jpg')], 60);

      expect(result.map((r) => r?.url)).toEqual(['https://signed/a.jpg', 'https://signed/b.jpg']);
      // N+1의 원인이던 조회가 사라졌다.
      expect(prisma.diagnosisImage.findMany).not.toHaveBeenCalled();
      expect(store.getPresignedUrl).toHaveBeenCalledTimes(2);
    });

    it('한 건의 서명 실패가 나머지 항목을 버리지 않는다', async () => {
      store.getPresignedUrl
        .mockRejectedValueOnce(new Error('signing failed'))
        .mockResolvedValueOnce('https://signed/b.jpg');

      const result = await service.presignImages([image('a.jpg'), image('b.jpg')]);

      expect(result[0]).toBeNull();
      expect(result[1]?.url).toBe('https://signed/b.jpg');
    });
  });

  describe('storeDiagnosisImage', () => {
    const ref = {
      bucket: 'todayskin-bucket',
      key: 'diagnoses/1/snap-1/front-abc.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 4,
      checksumSha256: 'checksum',
      encryption: 'AES256',
      uri: 's3://todayskin-bucket/diagnoses/1/snap-1/front-abc.jpg',
    };

    it('객체 업로드 후 DB 저장이 실패하면 업로드 객체를 보상 삭제한다', async () => {
      store.putObject.mockResolvedValue(ref);
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
        bucket: 'todayskin-bucket',
        key: 'diagnoses/1/snap-1/front-abc.jpg',
      });
      expect(auditLog.log).not.toHaveBeenCalled();
    });

    it('N10: 이미지 교체 시 이전 객체를 정리한다', async () => {
      prisma.diagnosisImage.findUnique.mockResolvedValue({
        id: 'image-old',
        diagnosisId: 'snap-1',
        userId: 1,
        s3Bucket: 'todayskin-bucket',
        s3Key: 'diagnoses/1/snap-1/front-old.jpg',
        deletedAt: null,
      });
      store.putObject.mockResolvedValue(ref);

      await service.storeDiagnosisImage({
        userId: 1,
        diagnosisId: 'snap-1',
        image: {
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
          mimetype: 'image/jpeg',
          size: 4,
        },
      });

      expect(store.deleteObject).toHaveBeenCalledWith({
        bucket: 'todayskin-bucket',
        key: 'diagnoses/1/snap-1/front-old.jpg',
      });
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'image.stored' }),
      );
    });

    it('N10: 교체 정리 실패 시 orphan 대상으로 감사 로그만 남긴다', async () => {
      prisma.diagnosisImage.findUnique.mockResolvedValue({
        id: 'image-old',
        diagnosisId: 'snap-1',
        userId: 1,
        s3Bucket: 'todayskin-bucket',
        s3Key: 'diagnoses/1/snap-1/front-old.jpg',
        deletedAt: null,
      });
      store.putObject.mockResolvedValue(ref);
      store.deleteObject.mockRejectedValueOnce(new Error('s3 down'));

      // 교체 정리 실패는 저장 실패로 이어지지 않아야 한다.
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
      ).resolves.toEqual({ uri: ref.uri });

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'image.replace_cleanup_failed' }),
      );
    });
  });

  describe('deleteAllForUser (N10 2단계 삭제)', () => {
    const images = [
      {
        id: 'image-1',
        diagnosisId: 'snap-1',
        userId: 1,
        s3Bucket: 'todayskin-bucket',
        s3Key: 'diagnoses/1/snap-1/front.jpg',
        deleteAttempts: 0,
      },
    ];

    beforeEach(() => {
      prisma.diagnosisImage.findMany.mockResolvedValue(images);
    });

    it('1단계: 삭제 의도를 pendingDeleteAt으로 먼저 기록한다', async () => {
      store.deleteObject.mockResolvedValue(undefined);

      await service.deleteAllForUser(1);

      expect(prisma.diagnosisImage.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, deletedAt: null, pendingDeleteAt: null },
        data: { pendingDeleteAt: expect.any(Date) },
      });
    });

    it('2단계: 객체 삭제 성공 시 deletedAt 완료 + pendingDeleteAt 해제', async () => {
      store.deleteObject.mockResolvedValue(undefined);

      await service.deleteAllForUser(1);

      expect(prisma.$transaction).toHaveBeenCalled();
      const txUpdate = prisma.$transaction.mock.calls[0][0];
      const tx = {
        diagnosisImage: {
          upsert: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
        },
        diagnosis: { update: jest.fn().mockResolvedValue({}) },
      };
      await txUpdate(tx);
      expect(tx.diagnosisImage.update).toHaveBeenCalledWith({
        where: { id: 'image-1' },
        data: {
          deletedAt: expect.any(Date),
          pendingDeleteAt: null,
          lastDeleteError: null,
        },
      });
    });

    it('객체 삭제 실패 시 pendingDeleteAt 유지 + deleteAttempts/오류 기록 후 503', async () => {
      store.deleteObject.mockRejectedValue(new Error('s3 unavailable'));

      await expect(service.deleteAllForUser(1)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(prisma.diagnosisImage.update).toHaveBeenCalledWith({
        where: { id: 'image-1' },
        data: {
          deleteAttempts: 1,
          lastDeleteError: 's3 unavailable',
        },
      });
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

  describe('retryPendingDeletes (N10 재시도 worker)', () => {
    it('미완료 row를 스캔해 성공 건을 완료 마킹한다', async () => {
      prisma.diagnosisImage.findMany.mockResolvedValue([
        {
          id: 'image-1',
          diagnosisId: 'snap-1',
          userId: 1,
          s3Bucket: 'todayskin-bucket',
          s3Key: 'diagnoses/1/snap-1/front.jpg',
          deleteAttempts: 1,
          pendingDeleteAt: new Date(),
        },
      ]);
      store.deleteObject.mockResolvedValue(undefined);

      const report = await service.retryPendingDeletes();

      expect(report).toEqual({
        scanned: 1,
        deleted: 1,
        failed: 0,
        skippedMaxAttempts: 0,
      });
      expect(prisma.diagnosisImage.findMany).toHaveBeenCalledWith({
        where: { pendingDeleteAt: { not: null }, deletedAt: null },
        orderBy: { pendingDeleteAt: 'asc' },
        take: 100,
      });
    });

    it('재시도 실패 시 deleteAttempts 증가, 최대 시도 초과 시 permanent failure 감사 로그', async () => {
      config.get.mockReturnValue(2); // IMAGE_DELETE_MAX_ATTEMPTS = 2
      prisma.diagnosisImage.findMany.mockResolvedValue([
        {
          id: 'image-1',
          diagnosisId: 'snap-1',
          userId: 1,
          s3Bucket: 'todayskin-bucket',
          s3Key: 'diagnoses/1/snap-1/front.jpg',
          deleteAttempts: 1,
          pendingDeleteAt: new Date(),
        },
      ]);
      store.deleteObject.mockRejectedValue(new Error('s3 unavailable'));

      const report = await service.retryPendingDeletes();

      expect(report).toEqual({
        scanned: 1,
        deleted: 0,
        failed: 1,
        skippedMaxAttempts: 0,
      });
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'image.delete_permanent_failure' }),
      );
    });

    it('최대 시도 초과 건은 skip한다', async () => {
      config.get.mockReturnValue(2);
      prisma.diagnosisImage.findMany.mockResolvedValue([
        {
          id: 'image-1',
          diagnosisId: 'snap-1',
          userId: 1,
          s3Bucket: 'todayskin-bucket',
          s3Key: 'diagnoses/1/snap-1/front.jpg',
          deleteAttempts: 2,
          pendingDeleteAt: new Date(),
        },
      ]);

      const report = await service.retryPendingDeletes();

      expect(report).toEqual({
        scanned: 1,
        deleted: 0,
        failed: 0,
        skippedMaxAttempts: 1,
      });
      expect(store.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe('detectOrphans (N10 orphan 탐지/정리)', () => {
    it('dry-run: orphan을 탐지하되 실제 삭제하지 않는다', async () => {
      store.listObjects.mockResolvedValue([
        'diagnoses/1/snap-1/front.jpg',
        'diagnoses/1/snap-1/orphan.jpg',
      ]);
      prisma.diagnosisImage.findMany.mockResolvedValue([
        { s3Key: 'diagnoses/1/snap-1/front.jpg' },
      ]);

      const report = await service.detectOrphans({ dryRun: true });

      expect(report).toEqual({
        dryRun: true,
        totalObjects: 2,
        orphanCount: 1,
        orphanKeyHashes: [expect.stringMatching(/^[0-9a-f]{16}$/)],
        deletedKeyHashes: [],
      });
      // 개인정보(key 전체)가 report에 노출되지 않아야 한다.
      expect(JSON.stringify(report)).not.toContain('orphan.jpg');
      expect(JSON.stringify(report)).not.toContain('snap-1');
      expect(store.deleteObject).not.toHaveBeenCalled();
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'image.orphan_scan' }),
      );
    });

    it('dryRun=false: orphan 객체를 실제 삭제한다', async () => {
      store.listObjects.mockResolvedValue([
        'diagnoses/1/snap-1/front.jpg',
        'diagnoses/1/snap-1/orphan.jpg',
      ]);
      prisma.diagnosisImage.findMany.mockResolvedValue([
        { s3Key: 'diagnoses/1/snap-1/front.jpg' },
      ]);

      const report = await service.detectOrphans({ dryRun: false });

      expect(report.deletedKeyHashes).toEqual([expect.stringMatching(/^[0-9a-f]{16}$/)]);
      expect(JSON.stringify(report)).not.toContain('orphan.jpg');
      expect(store.deleteObject).toHaveBeenCalledWith({
        bucket: 'todayskin-bucket',
        key: 'diagnoses/1/snap-1/orphan.jpg',
      });
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'image.orphan_cleanup' }),
      );
    });
  });
});
