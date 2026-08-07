import { Test } from '@nestjs/testing';
import { IdempotencyService } from './idempotency.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * IdempotencyService (N14) 단위 테스트.
 * unique(scopeKey) 예약의 상태 전이(acquired/in_flight/completed/takeover)와
 * complete/release/retake 동작을 검증한다.
 */
describe('IdempotencyService', () => {
  let service: IdempotencyService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;
  const scopeKey = 'recommendation:diag-1';
  const userId = 1;

  beforeEach(async () => {
    prisma = {
      aiCallReservation: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(IdempotencyService);
  });

  it('삽입 성공 시 acquired', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'r1' }]);
    await expect(service.acquire(scopeKey, userId)).resolves.toEqual({
      outcome: 'acquired',
    });
    expect(prisma.aiCallReservation.findUnique).not.toHaveBeenCalled();
  });

  it('미만료 PENDING 존재 시 in_flight (takeover 없음)', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.aiCallReservation.findUnique.mockResolvedValue({
      id: 'r1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 30_000),
    });

    await expect(service.acquire(scopeKey, userId)).resolves.toEqual({
      outcome: 'in_flight',
    });
    expect(prisma.aiCallReservation.updateMany).not.toHaveBeenCalled();
  });

  it('COMPLETED 존재 시 completed', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.aiCallReservation.findUnique.mockResolvedValue({
      id: 'r1',
      status: 'COMPLETED',
      expiresAt: new Date(),
    });

    await expect(service.acquire(scopeKey, userId)).resolves.toEqual({
      outcome: 'completed',
    });
  });

  it('만료된 PENDING은 takeover해 acquired', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.aiCallReservation.findUnique.mockResolvedValue({
      id: 'r1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000),
    });
    prisma.aiCallReservation.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.acquire(scopeKey, userId)).resolves.toEqual({
      outcome: 'acquired',
    });
    expect(prisma.aiCallReservation.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.aiCallReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'r1' }),
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });

  it('FAILED 예약은 takeover해 acquired (재시도 허용)', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.aiCallReservation.findUnique.mockResolvedValue({
      id: 'r1',
      status: 'FAILED',
      expiresAt: new Date(),
    });
    prisma.aiCallReservation.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.acquire(scopeKey, userId)).resolves.toEqual({
      outcome: 'acquired',
    });
  });

  it('삽입↔삭제 경쟁: findUnique null이면 재삽입 후 acquired', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([]) // 1차 삽입 충돌
      .mockResolvedValueOnce([{ id: 'r2' }]); // 재삽입 성공
    prisma.aiCallReservation.findUnique.mockResolvedValue(null);

    await expect(service.acquire(scopeKey, userId)).resolves.toEqual({
      outcome: 'acquired',
    });
  });

  it('complete는 PENDING → COMPLETED로 전환', async () => {
    prisma.aiCallReservation.updateMany.mockResolvedValue({ count: 1 });
    await service.complete(scopeKey);
    expect(prisma.aiCallReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scopeKey, status: 'PENDING' }),
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('release는 PENDING row만 삭제한다 (COMPLETED 보존)', async () => {
    prisma.aiCallReservation.deleteMany.mockResolvedValue({ count: 1 });
    await service.release(scopeKey);
    expect(prisma.aiCallReservation.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scopeKey, status: 'PENDING' }),
      }),
    );
  });

  it('retake는 COMPLETED → PENDING으로 전환하고 true를 반환한다', async () => {
    prisma.aiCallReservation.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.retake(scopeKey)).resolves.toBe(true);
    expect(prisma.aiCallReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scopeKey, status: 'COMPLETED' }),
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });

  it('retake 경쟁에서 남이 먼저 점유했으면 false를 반환한다', async () => {
    prisma.aiCallReservation.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.retake(scopeKey)).resolves.toBe(false);
  });
});
