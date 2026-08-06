import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConsentService } from './consent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin/audit-log.service';
import { ImageStorageService } from '../storage/image-storage.service';
import { ConsentPurpose } from './enums/consent-purpose.enum';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ConsentService', () => {
  let service: ConsentService;
  let prisma: Record<string, any>;
  let auditLog: { log: jest.Mock };
  let imageStorage: { deleteAllForUser: jest.Mock };

  beforeEach(async () => {
    prisma = {
      consentRecord: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    imageStorage = { deleteAllForUser: jest.fn().mockResolvedValue(0) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConsentService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
        { provide: ImageStorageService, useValue: imageStorage },
      ],
    }).compile();

    service = moduleRef.get(ConsentService);
  });

  it('registry에 processing/storage/transfer 3개 purpose를 포함한다', () => {
    const registry = service.listRegistry();
    const purposes = registry.map((r) => r.purpose).sort();
    expect(purposes).toEqual(
      [
        ConsentPurpose.AI_RECOMMENDATION_DATA_TRANSFER,
        ConsentPurpose.DIAGNOSIS_IMAGE_PROCESSING,
        ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE,
      ].sort(),
    );
    expect(
      registry.find((r) => r.purpose === ConsentPurpose.DIAGNOSIS_IMAGE_PROCESSING)
        ?.required,
    ).toBe(true);
    expect(
      registry.find((r) => r.purpose === ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE)
        ?.required,
    ).toBe(false);
  });

  it('동의 upsert 시 audit consent.agreed를 남긴다', async () => {
    const now = new Date();
    prisma.consentRecord.upsert.mockResolvedValue({
      id: 1,
      purpose: ConsentPurpose.DIAGNOSIS_IMAGE_PROCESSING,
      agreed: true,
      version: '1.0.0',
      source: 'app',
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const dto = await service.upsert(10, {
      purpose: ConsentPurpose.DIAGNOSIS_IMAGE_PROCESSING,
      agreed: true,
    });

    expect(dto.active).toBe(true);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'consent.agreed', actorId: 10 }),
    );
  });

  it('저장 동의 철회 시 이미지를 삭제하고 consent.revoked를 남긴다', async () => {
    const now = new Date();
    prisma.consentRecord.upsert.mockResolvedValue({
      id: 2,
      purpose: ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE,
      agreed: false,
      version: '1.0.0',
      source: 'app',
      revokedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    imageStorage.deleteAllForUser.mockResolvedValue(3);

    await service.revoke(10, ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE);

    expect(imageStorage.deleteAllForUser).toHaveBeenCalledWith(10);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'consent.revoked' }),
    );
  });

  it('필수 동의 없으면 requireActive가 403 + consent.denied', async () => {
    prisma.consentRecord.findUnique.mockResolvedValue(null);
    await expect(
      service.requireActive(10, ConsentPurpose.DIAGNOSIS_IMAGE_PROCESSING),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'consent.denied', result: 'failure' }),
    );
  });

  it('구 version 동의는 active가 아니다', async () => {
    prisma.consentRecord.findUnique.mockResolvedValue({
      agreed: true,
      revokedAt: null,
      version: '0.9.0',
    });
    await expect(
      service.hasActive(10, ConsentPurpose.DIAGNOSIS_IMAGE_PROCESSING),
    ).resolves.toBe(false);
  });

  it('알 수 없는 purpose는 400', async () => {
    await expect(
      service.upsert(10, {
        purpose: 'unknown' as ConsentPurpose,
        agreed: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
