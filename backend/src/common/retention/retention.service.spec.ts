import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionService } from './retention.service';

/**
 * R11 보존 정책 스윕 테스트.
 *
 * 되돌릴 수 없는 DELETE이므로 "기본은 아무것도 지우지 않는다"와 "지울 때는 잘못된
 * 대상을 고르지 않는다"(PENDING job·최근 행)를 최우선으로 검증한다.
 */
describe('RetentionService (R11)', () => {
  const TABLES = [
    'refreshSession',
    'asyncJob',
    'aiCallReservation',
    'otpCode',
    'otpSendLog',
    'weatherSnapshot',
  ] as const;

  let service: RetentionService;
  let env: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;

  function delegate() {
    return {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
  }

  beforeEach(async () => {
    env = {};
    prisma = Object.fromEntries(TABLES.map((t) => [t, delegate()]));

    const moduleRef = await Test.createTestingModule({
      providers: [
        RetentionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: (key: string, fallback?: unknown) => env[key] ?? fallback },
        },
      ],
    }).compile();
    service = moduleRef.get(RetentionService);
  });

  describe('모드', () => {
    it('기본은 off — 아무 쿼리도 실행하지 않는다', async () => {
      const result = await service.sweep();
      expect(result.mode).toBe('off');
      expect(result.tables).toEqual({});
      for (const t of TABLES) {
        expect(prisma[t].findMany).not.toHaveBeenCalled();
        expect(prisma[t].deleteMany).not.toHaveBeenCalled();
        expect(prisma[t].count).not.toHaveBeenCalled();
      }
    });

    it('알 수 없는 값도 off로 떨어진다 (오타로 데이터가 지워지지 않는다)', async () => {
      env.RETENTION_SWEEP_MODE = 'DELETE';
      expect(service.mode()).toBe('off');
      env.RETENTION_SWEEP_MODE = 'on';
      expect(service.mode()).toBe('off');
    });

    it('dry-run은 개수만 세고 삭제하지 않는다', async () => {
      env.RETENTION_SWEEP_MODE = 'dry-run';
      prisma.asyncJob.count.mockResolvedValue(42);

      const result = await service.sweep();
      expect(result.mode).toBe('dry-run');
      expect(result.tables.asyncJob).toBe(42);
      for (const t of TABLES) {
        expect(prisma[t].deleteMany).not.toHaveBeenCalled();
      }
    });
  });

  describe('delete 모드', () => {
    beforeEach(() => {
      env.RETENTION_SWEEP_MODE = 'delete';
    });

    it('PENDING job은 삭제 대상이 아니다 — 워커가 아직 집어들 수 있다', async () => {
      await service.sweep();
      const where = prisma.asyncJob.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: ['COMPLETED', 'FAILED'] });
    });

    it('보존 기간만큼 과거인 행만 고른다', async () => {
      env.RETENTION_ASYNC_JOB_DAYS = 30;
      const now = new Date('2026-08-12T00:00:00.000Z');

      await service.sweep(now);
      const where = prisma.asyncJob.findMany.mock.calls[0][0].where;
      expect(where.createdAt.lt).toEqual(new Date('2026-07-13T00:00:00.000Z'));
    });

    it('환경변수로 보존 기간을 조정할 수 있다', async () => {
      env.RETENTION_WEATHER_SNAPSHOT_DAYS = 500;
      const now = new Date('2026-08-12T00:00:00.000Z');

      await service.sweep(now);
      const where = prisma.weatherSnapshot.findMany.mock.calls[0][0].where;
      const expected = new Date(now.getTime() - 500 * 86_400_000);
      expect(where.collectedAt.lt).toEqual(expected);
    });

    it('id를 먼저 조회한 뒤 그 목록만 삭제한다 (긴 테이블 잠금 방지)', async () => {
      prisma.otpCode.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
      prisma.otpCode.deleteMany.mockResolvedValueOnce({ count: 2 });

      const result = await service.sweep();
      expect(prisma.otpCode.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
      });
      expect(result.tables.otpCode).toBe(2);
    });

    it('배치가 꽉 차면 다음 배치를 이어서 지운다', async () => {
      env.RETENTION_BATCH_SIZE = 2;
      prisma.asyncJob.findMany
        .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
        .mockResolvedValueOnce([{ id: 'c' }]);
      prisma.asyncJob.deleteMany
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.sweep();
      expect(prisma.asyncJob.deleteMany).toHaveBeenCalledTimes(2);
      expect(result.tables.asyncJob).toBe(3);
      expect(result.truncated).not.toContain('asyncJob');
    });

    it('한 tick의 배치 상한을 넘으면 truncated로 알리고 멈춘다', async () => {
      env.RETENTION_BATCH_SIZE = 1;
      prisma.asyncJob.findMany.mockResolvedValue([{ id: 'a' }]);
      prisma.asyncJob.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.sweep();
      expect(result.truncated).toContain('asyncJob');
      // 무한 루프로 한 tick을 붙잡지 않는다.
      expect(prisma.asyncJob.deleteMany.mock.calls.length).toBeLessThanOrEqual(20);
    });

    it('한 테이블이 실패해도 나머지 테이블은 계속 진행한다', async () => {
      prisma.refreshSession.findMany.mockRejectedValue(new Error('db down'));
      prisma.otpCode.findMany.mockResolvedValueOnce([{ id: 1 }]);
      prisma.otpCode.deleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.sweep();
      expect(result.tables.refreshSession).toBeUndefined();
      expect(result.tables.otpCode).toBe(1);
    });

    it('만료 또는 폐기된 세션만 지운다 (유효 세션 보존)', async () => {
      await service.sweep();
      const where = prisma.refreshSession.findMany.mock.calls[0][0].where;
      expect(Object.keys(where)).toEqual(['OR']);
      expect(where.OR).toHaveLength(2);
    });

    it('완료된 AI 예약만 지운다 (PENDING 예약은 in-flight 가드다)', async () => {
      await service.sweep();
      const where = prisma.aiCallReservation.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('COMPLETED');
    });
  });
});
