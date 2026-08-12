import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { SoftDeleteService } from '../../common/soft-delete/soft-delete.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { OtpService } from '../otp/otp.service';
import { JwtKeyService } from './jwt-key.service';
import { SocialAuthService } from './social/social-auth.service';

/**
 * AuthService 단위 테스트 — 실제 PostgreSQL test DB(todayskin_test)를 사용한다.
 * 각 테스트는 격리를 위해 관련 데이터를 정리한다.
 *
 * DB 필요 조건: CI는 postgres service가 제공되어 항상 실행된다. 로컬에서 실행하려면
 * postgres를 띄우고 TEST_DATABASE_URL(또는 docker compose의 기본 test DB)을 사용한다.
 * DB가 없으면 로컬 `npm test`가 끊기지 않도록 스위트 전체를 skip한다.
 */
const describeWithDb =
  process.env.CI || process.env.TEST_DATABASE_URL ? describe : describe.skip;
describeWithDb('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let moduleRef: TestingModule;

  const testPhone = '01099999999';

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ??
      'postgresql://todayskin:secret@localhost:5432/todayskin_test';

    moduleRef = await Test.createTestingModule({
      providers: [
        { provide: SoftDeleteService, useValue: { withdrawUser: jest.fn(), assertActiveUser: jest.fn(), purgeExpired: jest.fn() } },
        
        AuthService,
        {
          provide: PrismaService,
          useValue: new PrismaService(),
        },
        {
          provide: JwtService,
          useValue: new JwtService({} as never),
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                JWT_ACCESS_SECRET: 'test_access_secret_at_least_32_characters_long',
                JWT_REFRESH_SECRET: 'test_refresh_secret_at_least_32_characters_long',
                ACCESS_TOKEN_EXPIRES_IN: '15m',
                REFRESH_TOKEN_EXPIRES_IN: '14d',
              };
              return map[key];
            },
          },
        },
        {
          // N2: OTP 검증은 단위 테스트에서 항상 통과하도록 모킹.
          provide: OtpService,
          useValue: {
            isVerified: async () => true,
            consumeVerification: async () => undefined,
          },
        },
        {
          // N2: JwtKeyService는 환경변수 기반 기본 키(v1)를 반환하도록 모킹.
          provide: JwtKeyService,
          useValue: {
            getSigningKey: async (purpose: 'access' | 'refresh') => ({
              kid: 'v1',
              secret:
                purpose === 'access'
                  ? 'test_access_secret_at_least_32_characters_long'
                  : 'test_refresh_secret_at_least_32_characters_long',
            }),
            getVerifyKey: async () => null,
          },
        },
        {
          // N33: 소셜 토큰 검증은 단위 테스트에서 mock으로 대체.
          provide: SocialAuthService,
          useValue: {
            verify: jest.fn().mockResolvedValue({
              providerUserId: 'kakao-test-1',
              name: '카카오 테스터',
              email: 'kakao@test.dev',
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    // N33: 소셜 계정(phoneNumber null) 정리.
    await prisma.socialAccount.deleteMany({}).catch(() => undefined);
    await prisma.user.deleteMany({ where: { phoneNumber: null } }).catch(() => undefined);
    await prisma?.$disconnect();
    await moduleRef?.close();
  });

  beforeEach(async () => {
    await prisma.refreshSession.deleteMany({});
    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });
  });

  it('signup - 신규 사용자 생성 및 accessToken 발급', async () => {
    const dto: SignupDto = {
      phoneNumber: testPhone,
      name: '테스터',
      birthDate: '2000-01-01',
      gender: 'male' as never,
    };

    const result = await service.signup(dto);

    expect(result.id).toBeDefined();
    expect(result.phoneNumber).toBe(testPhone);
    expect(result.name).toBe('테스터');
    expect(result.accessToken).toBeDefined();
  });

  it('signup - 하이픈 제거 정규화', async () => {
    const dto: SignupDto = {
      phoneNumber: '010-9999-9999',
      name: '테스터',
      birthDate: '2000-01-01',
    };

    const result = await service.signup(dto);
    expect(result.phoneNumber).toBe('01099999999');
  });

  it('signup - 중복 전화번호 409', async () => {
    const dto: SignupDto = {
      phoneNumber: testPhone,
      name: '테스터',
      birthDate: '2000-01-01',
    };
    await service.signup(dto);

    await expect(service.signup(dto)).rejects.toThrow(ConflictException);
  });

  it('login - 존재하는 사용자 토큰 발급', async () => {
    await service.signup({
      phoneNumber: testPhone,
      name: '테스터',
      birthDate: '2000-01-01',
    });

    const dto: LoginDto = { phoneNumber: testPhone };
    const result = await service.login(dto);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.expiresIn).toBe(900);
  });

  it('login - 미가입 전화번호 404', async () => {
    const dto: LoginDto = { phoneNumber: '01088888888' };
    await expect(service.login(dto)).rejects.toThrow(NotFoundException);
  });

  it('N28 updateMe - name/gender 수정 및 GET /me 형태 정합', async () => {
    const signupRes = await service.signup({
      phoneNumber: testPhone,
      name: '테스터',
      birthDate: '2000-01-01',
      gender: 'male' as never,
    });

    const updated = await service.updateMe(signupRes.id, {
      name: '새이름',
      gender: 'female' as never,
    });
    expect(updated.id).toBe(signupRes.id);
    expect(updated.name).toBe('새이름');
    expect(updated.gender).toBe('female');
    expect(updated.accessToken).toBeUndefined(); // GET /me 형태 — 토큰 없음

    const me = await service.getMe(signupRes.id);
    expect(me.name).toBe('새이름');
    expect(me.gender).toBe('female');
    expect(me.phoneNumber).toBe(testPhone);
  });

  it('N28 updateMe - gender null이면 미선택으로 초기화', async () => {
    const signupRes = await service.signup({
      phoneNumber: testPhone,
      name: '테스터',
      birthDate: '2000-01-01',
      gender: 'male' as never,
    });

    const updated = await service.updateMe(signupRes.id, {
      gender: null,
    });
    expect(updated.gender).toBeNull();
  });

  it('N28 updateMe - 존재하지 않는 사용자 404', async () => {
    await expect(
      service.updateMe(999999, { name: '새이름' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('N28 updateMe - 수정 필드 없으면 400', async () => {
    const signupRes = await service.signup({
      phoneNumber: testPhone,
      name: '테스터',
      birthDate: '2000-01-01',
    });
    await expect(service.updateMe(signupRes.id, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('logout - 세션 폐기', async () => {
    const user = await service.signup({
      phoneNumber: testPhone,
      name: '테스터',
      birthDate: '2000-01-01',
    });

    const sessionsBefore = await prisma.refreshSession.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(sessionsBefore).toBeGreaterThan(0);

    await service.logout(user.id);

    const sessionsAfter = await prisma.refreshSession.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(sessionsAfter).toBe(0);
  });

  it('refresh - 유효한 토큰으로 새 토큰 발급(회전)', async () => {
    await service.signup({
      phoneNumber: testPhone,
      name: '테스터',
      birthDate: '2000-01-01',
    });
    const loginResult = await service.login({ phoneNumber: testPhone });

    // login이 UserResponseDto를 반환하므로 refreshToken은 optional.
    const refreshToken = loginResult.refreshToken!;
    const refreshed = await service.refresh(refreshToken);

    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.refreshToken).toBeDefined();
    expect(refreshed.refreshToken).not.toBe(refreshToken);

    // 기존 토큰은 폐기되어 재사용 불가
    await expect(service.refresh(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('N33 socialLogin - 미가입 소셜 계정 생성 + isNewUser=true + 세션 발급', async () => {
    const result = await service.socialLogin({
      provider: 'kakao',
      accessToken: 'kakao-token',
    });

    expect(result.isNewUser).toBe(true);
    expect(result.id).toBeDefined();
    // 온보딩 전까지 phone/birthDate null.
    expect(result.phoneNumber).toBeNull();
    expect(result.birthDate).toBeNull();
    expect(result.name).toBe('카카오 테스터');
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();

    // SocialAccount가 생성되어 같은 소셜 계정으로는 여러 계정이 생기지 않는다.
    const accounts = await prisma.socialAccount.count({ where: { userId: result.id } });
    expect(accounts).toBe(1);
  });

  it('N33 socialLogin - 기존 소셜 계정은 isNewUser=false로 같은 사용자 로그인', async () => {
    const first = await service.socialLogin({
      provider: 'kakao',
      accessToken: 'kakao-token',
    });
    const second = await service.socialLogin({
      provider: 'kakao',
      accessToken: 'kakao-token',
    });

    expect(second.isNewUser).toBe(false);
    expect(second.id).toBe(first.id);
    // 같은 사용자라도 매 로그인마다 새 세션이 발급된다.
    expect(second.refreshToken).not.toBe(first.refreshToken);
  });

  it('N33 linkPhone - OTP 검증 후 전화번호·생년월일 연결', async () => {
    const social = await service.socialLogin({
      provider: 'kakao',
      accessToken: 'kakao-token-2',
    });
    expect(social.phoneNumber).toBeNull();

    const linked = await service.linkPhone(social.id, {
      phoneNumber: testPhone,
      birthDate: '1998-03-03',
    });
    expect(linked.phoneNumber).toBe(testPhone);
    expect(linked.birthDate).toBe('1998-03-03');

    // 이미 연결된 번호를 다른 소셜 계정이 가져가면 409.
    const other = await service.socialLogin({
      provider: 'google',
      accessToken: 'google-token',
    });
    await expect(
      service.linkPhone(other.id, { phoneNumber: testPhone }),
    ).rejects.toThrow(ConflictException);
  });

  it('refresh - 폐기된 토큰 401', async () => {
    const signupRes = await service.signup({
      phoneNumber: testPhone,
      name: '테스터',
      birthDate: '2000-01-01',
    });
    const loginResult = await service.login({ phoneNumber: testPhone });

    const refreshToken = loginResult.refreshToken!;

    await service.logout(signupRes.id);

    await expect(service.refresh(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // ── R21: 회전 계열(familyId) + 트랜잭션 회전 ────────────────
  describe('R21 refresh 회전', () => {
    /** 세션이 정확히 1개인 상태를 만든다 (signup만 — login을 더 하면 세션이 2개가 된다). */
    async function freshLogin(): Promise<{ userId: number; refreshToken: string }> {
      const signupRes = await service.signup({
        phoneNumber: testPhone,
        name: '테스터',
        birthDate: '2000-01-01',
      });
      return { userId: signupRes.id, refreshToken: signupRes.refreshToken! };
    }

    it('회전한 세션은 같은 familyId를 물려받는다', async () => {
      const { userId, refreshToken } = await freshLogin();
      const root = await prisma.refreshSession.findFirstOrThrow({ where: { userId } });
      // 새 로그인의 계열 뿌리는 자기 자신이다.
      expect(root.familyId).toBe(root.id);

      await service.refresh(refreshToken);

      const rotated = await prisma.refreshSession.findFirstOrThrow({
        where: { userId, revokedAt: null },
      });
      expect(rotated.id).not.toBe(root.id);
      expect(rotated.familyId).toBe(root.familyId);
    });

    it('폐기와 신규 발급이 한 트랜잭션이다 — 회전 후 유효 세션은 정확히 1개', async () => {
      const { userId, refreshToken } = await freshLogin();
      await service.refresh(refreshToken);

      const active = await prisma.refreshSession.count({
        where: { userId, revokedAt: null },
      });
      expect(active).toBe(1);
    });

    it('유예 시간 안의 재사용은 재시도로 보고 계열을 유지한다', async () => {
      const { userId, refreshToken } = await freshLogin();
      await service.refresh(refreshToken);

      // 방금 폐기된 토큰 재전송(네트워크 재시도) → 401이지만 계열은 살아 있다.
      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
      const active = await prisma.refreshSession.count({
        where: { userId, revokedAt: null },
      });
      expect(active).toBe(1);
    });

    it('유예를 지난 폐기 토큰이 다시 오면 계열 전체를 폐기한다 (재사용 탐지)', async () => {
      const { userId, refreshToken } = await freshLogin();
      await service.refresh(refreshToken);

      // 유예(기본 10초)를 넘긴 상태를 만든다 — 폐기 시각을 과거로 되돌린다.
      await prisma.refreshSession.updateMany({
        where: { userId, revokedAt: { not: null } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
      const active = await prisma.refreshSession.count({
        where: { userId, revokedAt: null },
      });
      expect(active).toBe(0);
    });

    it('같은 토큰의 동시 회전은 하나만 성공한다 (원자적 소비 유지)', async () => {
      const { userId, refreshToken } = await freshLogin();

      const results = await Promise.allSettled([
        service.refresh(refreshToken),
        service.refresh(refreshToken),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      // 실패한 쪽이 세션을 만들지 않았다 — 트랜잭션이 롤백된다.
      const active = await prisma.refreshSession.count({
        where: { userId, revokedAt: null },
      });
      expect(active).toBe(1);
    });
  });
});
