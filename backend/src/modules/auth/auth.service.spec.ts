import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { OtpService } from '../otp/otp.service';
import { JwtKeyService } from './jwt-key.service';

/**
 * AuthService 단위 테스트.
 * 실제 PostgreSQL test DB(todayskin_test)를 사용한다.
 * 각 테스트는 격리를 위해 관련 데이터를 정리한다.
 */
describe('AuthService', () => {
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
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
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
});
