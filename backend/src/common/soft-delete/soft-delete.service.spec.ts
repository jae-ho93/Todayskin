import { SoftDeleteService } from './soft-delete.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('SoftDeleteService', () => {
  // $transaction 콜백이 초기화 중인 prisma를 참조하지 않도록 mock 함수를 먼저 추출한다.
  const userUpdate = jest.fn();
  const userDelete = jest.fn();
  const diagnosisDeleteMany = jest.fn();
  const recommendationDeleteMany = jest.fn();
  const refreshSessionUpdateMany = jest.fn();

  const prisma = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: userUpdate,
      delete: userDelete,
    },
    diagnosis: { deleteMany: diagnosisDeleteMany },
    recommendation: { deleteMany: recommendationDeleteMany },
    refreshSession: { updateMany: refreshSessionUpdateMany },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        diagnosis: { deleteMany: diagnosisDeleteMany },
        recommendation: { deleteMany: recommendationDeleteMany },
        refreshSession: { updateMany: refreshSessionUpdateMany },
        user: { update: userUpdate, delete: userDelete },
      }),
    ),
  };
  const config = { get: jest.fn().mockReturnValue(30) };
  const imageStorage = { deleteAllForUser: jest.fn().mockResolvedValue(2) };
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };

  let service: SoftDeleteService;

  beforeEach(() => {
    jest.clearAllMocks();
    diagnosisDeleteMany.mockResolvedValue({ count: 0 });
    recommendationDeleteMany.mockResolvedValue({ count: 0 });
    refreshSessionUpdateMany.mockResolvedValue({ count: 1 });
    userUpdate.mockResolvedValue({});
    userDelete.mockResolvedValue({});
    service = new SoftDeleteService(
      prisma as never,
      config as never,
      imageStorage as never,
      auditLog as never,
    );
  });

  // ── N44: 탈퇴 시 진단 완전 삭제 ──────────────────────

  it('withdrawUser는 진단을 물리 삭제하고 PII를 스크럽한다', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 1, deletedAt: null });
    diagnosisDeleteMany.mockResolvedValue({ count: 2 });

    const result = await service.withdrawUser(1);

    expect(result.diagnosesDeleted).toBe(2);
    expect(result.imagesDeleted).toBe(2);
    expect(imageStorage.deleteAllForUser).toHaveBeenCalledWith(1);
    expect(diagnosisDeleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
    expect(prisma.user.update).toHaveBeenCalled();
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.soft_deleted' }),
    );
  });

  it('withdrawUser는 추천도 함께 지운다 — diagnosisId가 SetNull이라 방치하면 남는다', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 1, deletedAt: null });

    await service.withdrawUser(1);

    expect(recommendationDeleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
  });

  it('withdrawUser는 진단을 soft delete로 남기지 않는다', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 1, deletedAt: null });

    await service.withdrawUser(1);

    // 익명 보존(deletedAt/anonymizedAt 마킹)으로 되돌아가면 이 테스트가 깨진다.
    const scrub = userUpdate.mock.calls[0][0].data;
    expect(scrub).toMatchObject({ name: 'deleted', gender: null });
    expect(scrub.deletedAt).toBeInstanceOf(Date);
  });

  it('withdrawUser throws when missing', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.withdrawUser(9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('purgeExpired는 구 정책으로 남은 진단까지 지우고 User를 물리 삭제한다', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 3 }]);
    diagnosisDeleteMany.mockResolvedValue({ count: 4 });

    const result = await service.purgeExpired(new Date('2026-09-01T00:00:00Z'));

    expect(result).toEqual({ usersPurged: 1, diagnosesPurged: 4 });
    // User만 지우면 FK SetNull로 진단이 주인 없이 남는다 — 먼저 지워야 한다.
    expect(diagnosisDeleteMany).toHaveBeenCalledWith({ where: { userId: 3 } });
    expect(userDelete).toHaveBeenCalledWith({ where: { id: 3 } });
  });

  it('assertActiveUser rejects soft-deleted', () => {
    expect(() => service.assertActiveUser({ deletedAt: new Date() })).toThrow(
      ConflictException,
    );
  });
});
