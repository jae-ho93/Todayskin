import { Test } from '@nestjs/testing';
import { HttpStatus, HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { OtpService } from './otp.service';
import { OtpPurpose } from './enums/otp-purpose.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpGatewayError, OtpProvider } from './providers/otp-provider.interface';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * R34: OTP 정책의 경계 조건 단위 테스트.
 *
 * e2e는 행복 경로 중심이라 쿨다운 만료 직전/직후, 일일 한도 경계, 시도 횟수 소진
 * 같은 경계를 덮기 어렵다. 이 중 하나가 조용히 깨지면 OTP 무차별 대입이 열리거나
 * 정상 사용자가 가입하지 못한다.
 *
 * 시간 의존 로직은 jest.useFakeTimers로 고정한다.
 */
describe('OtpService', () => {
  const PHONE = '01012345678';
  const PURPOSE = OtpPurpose.SIGNUP;
  const NOW = new Date('2026-08-12T05:00:00.000Z'); // KST 14:00

  let prisma: Record<string, any>;
  let provider: OtpProvider & { verifySent: jest.Mock };
  let envBackup: NodeJS.ProcessEnv;

  function hash(salt: string, code: string): string {
    return createHash('sha256').update(`${salt}:${code}`).digest('hex');
  }

  /** OtpService는 생성자에서 설정을 읽으므로 env를 세팅한 뒤 인스턴스를 만든다. */
  async function createService(
    env: Record<string, string> = {},
  ): Promise<OtpService> {
    Object.assign(process.env, env);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) => process.env[key] ?? fallback,
          },
        },
      ],
    }).compile();
    return moduleRef.get(OtpService);
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    envBackup = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('OTP_')) delete process.env[key];
    }
    prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'code-1' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      otpSendLog: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    provider = {
      name: 'mock',
      recipientNumber: '1666-3538',
      verifySent: jest.fn().mockResolvedValue(true),
    } as OtpProvider & { verifySent: jest.Mock };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = envBackup;
  });

  describe('sendOtp — 코드 저장', () => {
    it('평문 코드를 저장하지 않고 salt + SHA-256 해시로 저장한다', async () => {
      const service = await createService();

      const { code, recipientNumber } = await service.sendOtp(PHONE, PURPOSE, provider);

      expect(code).toMatch(/^\d{6}$/);
      expect(recipientNumber).toBe('1666-3538');
      const { data } = prisma.otpCode.create.mock.calls[0][0];
      expect(data.codeHash).toBe(hash(data.salt, code));
      expect(data.codeHash).not.toContain(code);
      expect(data.salt).toHaveLength(32);
    });

    it('TTL만큼 뒤로 만료 시각을 설정한다', async () => {
      const service = await createService({ OTP_TTL_SECONDS: '180' });

      await service.sendOtp(PHONE, PURPOSE, provider);

      const { data } = prisma.otpCode.create.mock.calls[0][0];
      expect(data.expiresAt.getTime()).toBe(NOW.getTime() + 180_000);
      expect(data.maxAttempts).toBe(5);
    });

    it('발송 로그 기록이 실패해도 챌린지 생성은 성공한다', async () => {
      prisma.otpSendLog.create.mockRejectedValue(new Error('db down'));
      const service = await createService();

      await expect(service.sendOtp(PHONE, PURPOSE, provider)).resolves.toMatchObject({
        recipientNumber: '1666-3538',
      });
    });

    it('allowlisted 번호는 고정 코드(123456)를 쓴다', async () => {
      const service = await createService({ OTP_ALLOWLIST_PHONES: '010-1234-5678' });

      const { code } = await service.sendOtp(PHONE, PURPOSE, provider);

      expect(code).toBe('123456');
    });
  });

  describe('sendOtp — 재전송 쿨다운 경계', () => {
    it('쿨다운 만료 1초 전에는 429를 던진다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'code-1',
        sentAt: new Date(NOW.getTime() - 59_000),
      });
      const service = await createService({ OTP_RESEND_COOLDOWN_SECONDS: '60' });

      await expect(service.sendOtp(PHONE, PURPOSE, provider)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });

    it('쿨다운이 지난 직후에는 발송한다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'code-1',
        sentAt: new Date(NOW.getTime() - 60_000),
      });
      const service = await createService({ OTP_RESEND_COOLDOWN_SECONDS: '60' });

      await service.sendOtp(PHONE, PURPOSE, provider);

      expect(prisma.otpCode.create).toHaveBeenCalled();
    });

    it('남은 대기 시간을 초 단위로 안내한다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'code-1',
        sentAt: new Date(NOW.getTime() - 40_000),
      });
      const service = await createService({ OTP_RESEND_COOLDOWN_SECONDS: '60' });

      await expect(service.sendOtp(PHONE, PURPOSE, provider)).rejects.toThrow(
        'OTP 재전송은 20초 후 가능합니다',
      );
    });

    it('빈 문자열 쿨다운 설정이 제한을 해제하지 않는다 (기본 60초 적용)', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'code-1',
        sentAt: new Date(NOW.getTime() - 10_000),
      });
      const service = await createService({ OTP_RESEND_COOLDOWN_SECONDS: '' });

      await expect(service.sendOtp(PHONE, PURPOSE, provider)).rejects.toBeInstanceOf(
        HttpException,
      );
    });
  });

  describe('sendOtp — 일일 한도 경계 (KST)', () => {
    it('한도 직전(9/10)에는 발송한다', async () => {
      prisma.otpSendLog.count.mockResolvedValue(9);
      const service = await createService({ OTP_DAILY_LIMIT_PER_PHONE: '10' });

      await service.sendOtp(PHONE, PURPOSE, provider);

      expect(prisma.otpCode.create).toHaveBeenCalled();
    });

    it('한도에 도달하면 429를 던진다', async () => {
      prisma.otpSendLog.count.mockResolvedValue(10);
      const service = await createService({ OTP_DAILY_LIMIT_PER_PHONE: '10' });

      await expect(service.sendOtp(PHONE, PURPOSE, provider)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('한도 집계 기준은 KST 자정이다', async () => {
      const service = await createService({ OTP_DAILY_LIMIT_PER_PHONE: '10' });

      await service.sendOtp(PHONE, PURPOSE, provider);

      const { where } = prisma.otpSendLog.count.mock.calls[0][0];
      // 2026-08-12 KST 자정 = 2026-08-11T15:00:00Z
      expect(where.sentAt.gte.toISOString()).toBe('2026-08-11T15:00:00.000Z');
    });

    it('0이면 한도 없음으로 집계 조회조차 하지 않는다', async () => {
      const service = await createService({ OTP_DAILY_LIMIT_PER_PHONE: '0' });

      await service.sendOtp(PHONE, PURPOSE, provider);

      expect(prisma.otpSendLog.count).not.toHaveBeenCalled();
    });

    it('allowlisted 번호는 일일 한도에서 제외된다', async () => {
      prisma.otpSendLog.count.mockResolvedValue(999);
      const service = await createService({
        OTP_DAILY_LIMIT_PER_PHONE: '10',
        OTP_ALLOWLIST_PHONES: PHONE,
      });

      await service.sendOtp(PHONE, PURPOSE, provider);

      expect(prisma.otpCode.create).toHaveBeenCalled();
    });

    it('비숫자 한도 설정은 기본값(10)으로 되돌린다', async () => {
      prisma.otpSendLog.count.mockResolvedValue(10);
      const service = await createService({ OTP_DAILY_LIMIT_PER_PHONE: 'unlimited' });

      await expect(service.sendOtp(PHONE, PURPOSE, provider)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });
  });

  describe('sendOtp — 번호별 미검증 코드 상한', () => {
    it('상한에 도달하면 가장 오래된 코드를 폐기한다', async () => {
      prisma.otpCode.findMany.mockResolvedValue([
        { id: 'old-1' },
        { id: 'old-2' },
        { id: 'old-3' },
      ]);
      const service = await createService({ OTP_MAX_PENDING_PER_PHONE: '3' });

      await service.sendOtp(PHONE, PURPOSE, provider);

      expect(prisma.otpCode.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1'] } },
      });
    });

    it('상한 미만이면 폐기하지 않는다', async () => {
      prisma.otpCode.findMany.mockResolvedValue([{ id: 'old-1' }]);
      const service = await createService({ OTP_MAX_PENDING_PER_PHONE: '3' });

      await service.sendOtp(PHONE, PURPOSE, provider);

      expect(prisma.otpCode.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    const SALT = 'a'.repeat(32);

    function pendingCode(overrides: Record<string, unknown> = {}) {
      return {
        id: 'code-1',
        salt: SALT,
        codeHash: hash(SALT, '123456'),
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(NOW.getTime() + 60_000),
        ...overrides,
      };
    }

    it('발송 기록이 없으면 401', async () => {
      const service = await createService();

      await expect(
        service.verifyOtp(PHONE, PURPOSE, '123456', provider),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('만료 1ms 뒤에는 만료로 처리한다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(
        pendingCode({ expiresAt: new Date(NOW.getTime() - 1) }),
      );
      const service = await createService();

      await expect(service.verifyOtp(PHONE, PURPOSE, '123456', provider)).rejects.toThrow(
        /만료/,
      );
    });

    it('만료 시각 직전에는 검증을 계속한다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(
        pendingCode({ expiresAt: new Date(NOW.getTime() + 1) }),
      );
      const service = await createService();

      await expect(
        service.verifyOtp(PHONE, PURPOSE, '123456', provider),
      ).resolves.toBeUndefined();
    });

    it('코드가 틀리면 시도 횟수를 올리고 남은 횟수를 알려준다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(pendingCode({ attempts: 1 }));
      const service = await createService();

      await expect(service.verifyOtp(PHONE, PURPOSE, '000000', provider)).rejects.toThrow(
        '남은 시도: 3',
      );
      expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
        where: { id: 'code-1', attempts: { lt: 5 } },
        data: { attempts: { increment: 1 } },
      });
    });

    it('마지막 시도를 소진하면 남은 횟수 대신 초과로 응답한다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(pendingCode({ attempts: 4 }));
      const service = await createService();

      await expect(service.verifyOtp(PHONE, PURPOSE, '000000', provider)).rejects.toThrow(
        '시도 횟수를 초과',
      );
    });

    it('이미 시도 횟수를 소진했으면 게이트웨이를 호출하지 않는다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(pendingCode({ attempts: 5 }));
      const service = await createService();

      await expect(service.verifyOtp(PHONE, PURPOSE, '123456', provider)).rejects.toThrow(
        '시도 횟수를 초과',
      );
      expect(provider.verifySent).not.toHaveBeenCalled();
    });

    it('동시 요청이 한도를 넘기면(updateMany 0건) 초과로 처리한다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(pendingCode({ attempts: 1 }));
      prisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
      const service = await createService();

      await expect(service.verifyOtp(PHONE, PURPOSE, '000000', provider)).rejects.toThrow(
        '시도 횟수를 초과',
      );
    });

    it('문자 수신이 확인되지 않으면 시도 횟수를 소모하지 않고 401', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(pendingCode());
      provider.verifySent.mockResolvedValue(false);
      const service = await createService();

      await expect(service.verifyOtp(PHONE, PURPOSE, '123456', provider)).rejects.toThrow(
        /문자가 확인되지 않았습니다|확인되지 않았습니다/,
      );
      expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    });

    it('게이트웨이 장애는 503으로 매핑한다 (가짜 성공 금지)', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(pendingCode());
      provider.verifySent.mockRejectedValue(new OtpGatewayError('timeout'));
      const service = await createService();

      await expect(service.verifyOtp(PHONE, PURPOSE, '123456', provider)).rejects.toMatchObject(
        { status: HttpStatus.SERVICE_UNAVAILABLE },
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('성공 시 verified 전환과 잔여 코드 폐기를 한 트랜잭션에서 한다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(pendingCode());
      const service = await createService();

      await service.verifyOtp(PHONE, PURPOSE, '123456', provider);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'code-1' },
        data: { verified: true },
      });
      expect(prisma.otpCode.deleteMany).toHaveBeenCalledWith({
        where: { phoneNumber: PHONE, purpose: PURPOSE, verified: false, id: { not: 'code-1' } },
      });
    });
  });

  describe('isVerified — 검증 인정 창', () => {
    it('TTL x2 이내면 인정한다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        createdAt: new Date(NOW.getTime() - 359_000),
      });
      const service = await createService({ OTP_TTL_SECONDS: '180' });

      await expect(service.isVerified(PHONE, PURPOSE)).resolves.toBe(true);
    });

    it('TTL x2를 지나면 인정하지 않는다', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        createdAt: new Date(NOW.getTime() - 361_000),
      });
      const service = await createService({ OTP_TTL_SECONDS: '180' });

      await expect(service.isVerified(PHONE, PURPOSE)).resolves.toBe(false);
    });

    it('검증 기록이 없으면 false', async () => {
      const service = await createService();

      await expect(service.isVerified(PHONE, PURPOSE)).resolves.toBe(false);
    });
  });
});
