import { SoftDeleteService } from './soft-delete.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('SoftDeleteService', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    diagnosis: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    refreshSession: { updateMany: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        diagnosis: { updateMany: prisma.diagnosis.updateMany },
        refreshSession: { updateMany: prisma.refreshSession.updateMany },
        user: { update: prisma.user.update },
      }),
    ),
  };
  const config = { get: jest.fn().mockReturnValue(30) };
  const imageStorage = { deleteAllForUser: jest.fn().mockResolvedValue(2) };
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };

  let service: SoftDeleteService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SoftDeleteService(
      prisma as never,
      config as never,
      imageStorage as never,
      auditLog as never,
    );
  });

  it('withdrawUser soft-deletes and scrubs PII', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 1, deletedAt: null });
    prisma.diagnosis.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    prisma.diagnosis.updateMany.mockResolvedValue({ count: 2 });
    prisma.refreshSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});

    const result = await service.withdrawUser(1);
    expect(result.diagnosesSoftDeleted).toBe(2);
    expect(result.imagesDeleted).toBe(2);
    expect(imageStorage.deleteAllForUser).toHaveBeenCalledWith(1);
    expect(prisma.user.update).toHaveBeenCalled();
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.soft_deleted' }),
    );
  });

  it('withdrawUser throws when missing', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.withdrawUser(9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('purgeExpired deletes users past purgeAfter', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.diagnosis.count.mockResolvedValue(4);
    prisma.user.delete.mockResolvedValue({});
    const result = await service.purgeExpired(new Date('2026-09-01T00:00:00Z'));
    expect(result).toEqual({ usersPurged: 1, diagnosesDetached: 4 });
  });

  it('assertActiveUser rejects soft-deleted', () => {
    expect(() => service.assertActiveUser({ deletedAt: new Date() })).toThrow(
      ConflictException,
    );
  });
});
