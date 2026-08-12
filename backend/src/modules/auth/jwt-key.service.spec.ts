import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtKeyService } from './jwt-key.service';
import { PrismaService } from '../../prisma/prisma.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * R34: JWT 키 회전 단위 테스트.
 *
 * 이 서비스가 조용히 깨지면 (a) 회전 직후 발급된 토큰을 검증할 수 없어 전체 로그아웃,
 * (b) 반대로 폐기했다고 믿은 키로 계속 검증되는 상황이 생긴다. 캐시 TTL·무효화와
 * 기본 키 자동 등록의 경계를 고정한다.
 */
describe('JwtKeyService', () => {
  const ACCESS_SECRET = 'access_secret_at_least_32_characters_long';
  const REFRESH_SECRET = 'refresh_secret_at_least_32_characters_long';

  let prisma: Record<string, any>;
  let service: JwtKeyService;
  let env: Record<string, string | undefined>;

  async function createService(): Promise<JwtKeyService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtKeyService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      ],
    }).compile();
    return moduleRef.get(JwtKeyService);
  }

  beforeEach(async () => {
    env = {
      JWT_ACCESS_SECRET: ACCESS_SECRET,
      JWT_REFRESH_SECRET: REFRESH_SECRET,
    };
    prisma = {
      jwtKeyRotation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    service = await createService();
  });

  describe('기본 키 자동 등록', () => {
    it('DB에 키가 없으면 환경변수 secret을 purpose별 v1 kid로 등록한다', async () => {
      prisma.jwtKeyRotation.findMany.mockResolvedValue([
        { kid: 'v1-access', secret: ACCESS_SECRET, purpose: 'access', active: true },
      ]);

      const key = await service.getSigningKey('access');

      expect(prisma.jwtKeyRotation.create).toHaveBeenCalledWith({
        data: { kid: 'v1-access', secret: ACCESS_SECRET, purpose: 'access', active: true },
      });
      expect(key).toEqual({ kid: 'v1-access', secret: ACCESS_SECRET });
    });

    it('access와 refresh의 kid를 분리한다 (kid unique 제약)', async () => {
      prisma.jwtKeyRotation.findMany.mockResolvedValue([
        { kid: 'v1-refresh', secret: REFRESH_SECRET, purpose: 'refresh', active: true },
      ]);

      const key = await service.getSigningKey('refresh');

      expect(key.kid).toBe('v1-refresh');
    });

    it('이미 등록돼 있으면 다시 만들지 않는다', async () => {
      prisma.jwtKeyRotation.findFirst.mockResolvedValue({ kid: 'v1-access' });
      prisma.jwtKeyRotation.findMany.mockResolvedValue([
        { kid: 'v1-access', secret: ACCESS_SECRET, purpose: 'access', active: true },
      ]);

      await service.getSigningKey('access');

      expect(prisma.jwtKeyRotation.create).not.toHaveBeenCalled();
    });

    it('동시 등록으로 중복(P2002)이 나면 무시하고 진행한다', async () => {
      prisma.jwtKeyRotation.create.mockRejectedValue({ code: 'P2002' });
      prisma.jwtKeyRotation.findMany.mockResolvedValue([
        { kid: 'v1-access', secret: ACCESS_SECRET, purpose: 'access', active: true },
      ]);

      await expect(service.getSigningKey('access')).resolves.toEqual({
        kid: 'v1-access',
        secret: ACCESS_SECRET,
      });
    });

    it('P2002가 아닌 오류는 그대로 전파한다', async () => {
      prisma.jwtKeyRotation.create.mockRejectedValue(new Error('db down'));

      await expect(service.getSigningKey('access')).rejects.toThrow('db down');
    });

    it('환경변수 secret이 없으면 등록을 건너뛴다', async () => {
      env.JWT_ACCESS_SECRET = undefined;

      await expect(service.getSigningKey('access')).rejects.toThrow(
        '활성 JWT access 키가 없습니다',
      );
      expect(prisma.jwtKeyRotation.create).not.toHaveBeenCalled();
    });

    it('active 키가 없으면 서명하지 않고 실패한다', async () => {
      prisma.jwtKeyRotation.findFirst.mockResolvedValue({ kid: 'v1-access' });
      prisma.jwtKeyRotation.findMany.mockResolvedValue([
        { kid: 'v1-access', secret: ACCESS_SECRET, purpose: 'access', active: false },
      ]);

      await expect(service.getSigningKey('access')).rejects.toThrow(
        '활성 JWT access 키가 없습니다',
      );
    });
  });

  describe('검증 키 조회', () => {
    beforeEach(() => {
      prisma.jwtKeyRotation.findMany.mockResolvedValue([
        { kid: 'v1-access', secret: 'old-secret', purpose: 'access', active: false },
        { kid: 'v2-access', secret: 'new-secret', purpose: 'access', active: true },
      ]);
    });

    it('비활성 키로도 검증은 가능하다 (기존 토큰 만료까지)', async () => {
      await expect(service.getVerifyKey('v1-access', 'access')).resolves.toBe('old-secret');
    });

    it('purpose가 다르면 같은 kid라도 반환하지 않는다', async () => {
      await expect(service.getVerifyKey('v1-access', 'refresh')).resolves.toBeNull();
    });

    it('모르는 kid는 null을 반환한다', async () => {
      await expect(service.getVerifyKey('v9-access', 'access')).resolves.toBeNull();
    });
  });

  describe('캐시', () => {
    it('TTL 이내에는 DB를 다시 읽지 않는다', async () => {
      prisma.jwtKeyRotation.findMany.mockResolvedValue([
        { kid: 'v1-access', secret: ACCESS_SECRET, purpose: 'access', active: true },
      ]);

      await service.getVerifyKey('v1-access', 'access');
      await service.getVerifyKey('v1-access', 'access');

      expect(prisma.jwtKeyRotation.findMany).toHaveBeenCalledTimes(1);
    });

    it('TTL(60초)이 지나면 다시 읽는다', async () => {
      jest.useFakeTimers({ now: new Date('2026-08-12T05:00:00.000Z') });
      try {
        prisma.jwtKeyRotation.findMany.mockResolvedValue([
          { kid: 'v1-access', secret: ACCESS_SECRET, purpose: 'access', active: true },
        ]);
        await service.getVerifyKey('v1-access', 'access');

        jest.advanceTimersByTime(60_001);
        await service.getVerifyKey('v1-access', 'access');

        expect(prisma.jwtKeyRotation.findMany).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('invalidateCache 후에는 즉시 다시 읽는다', async () => {
      prisma.jwtKeyRotation.findMany.mockResolvedValue([
        { kid: 'v1-access', secret: ACCESS_SECRET, purpose: 'access', active: true },
      ]);
      await service.getVerifyKey('v1-access', 'access');

      service.invalidateCache();
      await service.getVerifyKey('v1-access', 'access');

      expect(prisma.jwtKeyRotation.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('rotate', () => {
    it('기존 active 키를 내리고 새 키를 올린다 (한 트랜잭션)', async () => {
      await service.rotate('v2-access', 'new-secret', 'access');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.jwtKeyRotation.updateMany).toHaveBeenCalledWith({
        where: { purpose: 'access', active: true },
        data: { active: false },
      });
      expect(prisma.jwtKeyRotation.create).toHaveBeenCalledWith({
        data: { kid: 'v2-access', secret: 'new-secret', purpose: 'access', active: true },
      });
    });

    it('회전 직후 조회는 캐시가 아니라 DB 상태를 반영한다', async () => {
      prisma.jwtKeyRotation.findMany.mockResolvedValue([
        { kid: 'v1-access', secret: 'old-secret', purpose: 'access', active: true },
      ]);
      await service.getVerifyKey('v1-access', 'access');

      prisma.jwtKeyRotation.findMany.mockResolvedValue([
        { kid: 'v1-access', secret: 'old-secret', purpose: 'access', active: false },
        { kid: 'v2-access', secret: 'new-secret', purpose: 'access', active: true },
      ]);
      await service.rotate('v2-access', 'new-secret', 'access');
      prisma.jwtKeyRotation.findFirst.mockResolvedValue({ kid: 'v1-access' });

      await expect(service.getSigningKey('access')).resolves.toEqual({
        kid: 'v2-access',
        secret: 'new-secret',
      });
    });
  });
});
