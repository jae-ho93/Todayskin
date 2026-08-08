import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { SocialLoginResponseDto } from './dto/social-login-response.dto';
import { LinkPhoneDto } from './dto/link-phone.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { Gender } from './enums/gender.enum';
import { SocialAuthService } from './social/social-auth.service';
import { JwtPayload } from '../../common/strategies/jwt.strategy';
import { OtpService } from '../otp/otp.service';
import { OtpPurpose } from '../otp/enums/otp-purpose.enum';
import { JwtKeyService } from './jwt-key.service';
import { SoftDeleteService } from '../../common/soft-delete/soft-delete.service';
import { notDeletedWhere } from '../../common/soft-delete/soft-delete.policy';
import { SocialProviderName } from './social/social-provider.interface';
import type { User as UserModel } from '@prisma/client';

/**
 * 토큰 만료 문자열(ex: "15m", "14d")을 초 단위로 변환.
 * 응답에 초 단위로 노출하기 위해 별도 파싱.
 */
function expiresInToSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) return 900; // fallback 15m
  const num = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's':
      return num;
    case 'm':
      return num * 60;
    case 'h':
      return num * 3600;
    case 'd':
      return num * 86400;
    default:
      return 900;
  }
}

/**
 * Refresh Token의 해시. DB에는 평문이 아닌 해시를 저장한다.
 * SHA-256 사용 — 운영에서는 추가 솔트/pepper 도입 권장(T3 범위 외).
 */
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly jwtKeyService: JwtKeyService,
    private readonly softDelete: SoftDeleteService,
    private readonly socialAuth: SocialAuthService,
  ) {}

  async signup(dto: SignupDto): Promise<UserResponseDto> {
    const phoneNumber = this.normalizePhone(dto.phoneNumber);

    // N2: 가입 시 OTP 본인확인 필수. OTP 검증 완료 내역이 있어야 가입 진행.
    const verified = await this.otpService.isVerified(
      phoneNumber,
      OtpPurpose.SIGNUP,
    );
    if (!verified) {
      throw new UnauthorizedException('전화번호 본인확인(OTP)이 필요합니다');
    }

    const existing = await this.prisma.user.findUnique({
      where: { phoneNumber },
    });
    if (existing) {
      throw new ConflictException('이미 가입된 휴대폰 번호입니다');
    }

    const birthDate = parseBirthDate(dto.birthDate);
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          phoneNumber,
          name: dto.name.trim(),
          birthDate,
          gender: dto.gender ?? null,
        },
      });
    } catch (e) {
      // 사전 findUnique는 사용자 경험을 위한 빠른 오류이고, 실제 중복
      // 보장은 DB unique 제약과 race-safe P2002 처리로 한다.
      if (prismaErrorCode(e) === 'P2002') {
        throw new ConflictException('이미 가입된 휴대폰 번호입니다');
      }
      throw e;
    }

    const tokens = await this.issueTokens(user.id, user.role);

    // signup 시에도 refresh token을 발급해 login과 동일한 세션 수명을 제공한다.
    // 기존 프론트는 accessToken만 사용하므로 refreshToken/expiresIn은 무시된다.
    // N2: 가입 완료 후 OTP 검증 내역 소비(재사용 방지).
    await this.otpService.consumeVerification(phoneNumber, OtpPurpose.SIGNUP);
    return this.toUserResponse(
      user,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresIn,
    );
  }

  async login(dto: LoginDto): Promise<UserResponseDto> {
    const phoneNumber = this.normalizePhone(dto.phoneNumber);

    // N2: 로그인 시 OTP 본인확인 필수. 새 디바이스 로그인 보안.
    const verified = await this.otpService.isVerified(
      phoneNumber,
      OtpPurpose.LOGIN,
    );
    if (!verified) {
      throw new UnauthorizedException('전화번호 본인확인(OTP)이 필요합니다');
    }

    const user = await this.prisma.user.findUnique({
      where: { phoneNumber },
    });
    if (!user) {
      throw new NotFoundException('가입되지 않은 휴대폰 번호입니다');
    }
    if (user.deletedAt) {
      throw new ConflictException('탈퇴한 계정입니다');
    }

    // 기존 FastAPI /auth/login 응답 호환:
    // 프론트는 login 응답을 User 객체로 취급해 id/name/phoneNumber/... 와 accessToken을
    // AsyncStorage에 세션으로 저장한다. 토큰만 반환하면 프론트 호환이 깨지므로
    // User 필드 + 토큰을 함께 반환한다.
    // N2: 로그인 완료 후 OTP 검증 내역 소비(재사용 방지).
    await this.otpService.consumeVerification(phoneNumber, OtpPurpose.LOGIN);
    const tokens = await this.issueTokens(user.id, user.role);
    return this.toUserResponse(
      user,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresIn,
    );
  }

  /**
   * N33: 소셜 로그인 (Kakao·Google·Apple).
   *
   * 1) 제공자 API/JWKS로 토큰을 서버 검증한다 (클라이언트 토큰 신뢰 안 함).
   * 2) (provider, providerUserId)로 연결된 계정을 찾으면 기존 refresh 세션으로 로그인.
   * 3) 미가입이면 User + SocialAccount를 한 transaction으로 생성하고 isNewUser=true로
   *    온보딩(동의 + 선택 전화 연결)을 안내한다. 세션은 기존 refresh 흐름을 그대로 쓴다.
   * 4) 같은 소셜 계정으로 여러 계정이 생기지 않도록 unique(provider, providerUserId)로
   *    보장하고, 동시 요청 P2002는 재조회로 수렴시킨다.
   */
  async socialLogin(dto: SocialLoginDto): Promise<SocialLoginResponseDto> {
    const profile = await this.socialAuth.verify(dto.provider, dto.accessToken);

    const account = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: dto.provider,
          providerUserId: profile.providerUserId,
        },
      },
    });

    let user: UserModel;
    let isNewUser = false;

    if (account) {
      const existing = await this.prisma.user.findUnique({
        where: { id: account.userId },
      });
      if (!existing || existing.deletedAt) {
        throw new ConflictException('탈퇴한 계정입니다');
      }
      user = existing;
    } else {
      try {
        user = await this.prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              // 전화번호/생년월일은 온보딩(link-phone)에서 연결한다.
              phoneNumber: null,
              name:
                profile.name?.trim() ||
                `${this.providerLabel(dto.provider)} 회원`,
              birthDate: null,
            },
          });
          await tx.socialAccount.create({
            data: {
              userId: created.id,
              provider: dto.provider,
              providerUserId: profile.providerUserId,
              email: profile.email,
            },
          });
          return created;
        });
        isNewUser = true;
      } catch (e) {
        if (prismaErrorCode(e) === 'P2002') {
          // 동시 요청이 먼저 같은 소셜 계정을 만들었다 — 재조회해 수렴.
          const linked = await this.prisma.socialAccount.findUnique({
            where: {
              provider_providerUserId: {
                provider: dto.provider,
                providerUserId: profile.providerUserId,
              },
            },
            include: { user: true },
          });
          if (!linked?.user || linked.user.deletedAt) {
            throw new ConflictException('탈퇴한 계정입니다');
          }
          user = linked.user;
        } else {
          throw e;
        }
      }
    }

    // 기존 refresh 세션 흐름 그대로 — access/refresh 토큰 발급.
    const tokens = await this.issueTokens(user.id, user.role);
    const res = this.toUserResponse(
      user,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresIn,
    );
    return { ...res, isNewUser };
  }

  /**
   * N33: 소셜 계정에 전화번호 연결 (온보딩).
   * OTP(social_link) 본인확인 후 phoneNumber(+선택 birthDate)를 저장한다.
   * 이미 다른 계정이 쓴 번호는 409. 기존 전화 가입 계정과 합병은 범위 밖.
   */
  async linkPhone(userId: number, dto: LinkPhoneDto): Promise<UserResponseDto> {
    const phoneNumber = this.normalizePhone(dto.phoneNumber);

    const verified = await this.otpService.isVerified(
      phoneNumber,
      OtpPurpose.SOCIAL_LINK,
    );
    if (!verified) {
      throw new UnauthorizedException('전화번호 본인확인(OTP)이 필요합니다');
    }

    const me = await this.prisma.user.findFirst({
      where: notDeletedWhere({ id: userId }),
    });
    if (!me) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }

    // N28 범위 결정 유지: 전화번호 변경은 이 경로로 하지 않는다.
    // 이미 전화번호가 연결된 계정(전화 가입자 등)은 link-phone으로 번호를 바꿀 수 없다.
    if (me.phoneNumber && me.phoneNumber !== phoneNumber) {
      throw new ConflictException('이미 전화번호가 연결된 계정입니다');
    }

    const existing = await this.prisma.user.findUnique({
      where: { phoneNumber },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException('이미 가입된 휴대폰 번호입니다');
    }
    if (existing?.deletedAt) {
      throw new ConflictException('탈퇴한 계정입니다');
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          phoneNumber,
          birthDate: dto.birthDate ? parseBirthDate(dto.birthDate) : undefined,
        },
      });
      // N2 패턴: 연결 성공 후 검증 내역 소비(재사용 방지).
      await this.otpService.consumeVerification(
        phoneNumber,
        OtpPurpose.SOCIAL_LINK,
      );
      return this.toUserResponse(updated);
    } catch (e) {
      if (prismaErrorCode(e) === 'P2002') {
        throw new ConflictException('이미 가입된 휴대폰 번호입니다');
      }
      throw e;
    }
  }

  async logout(userId: number): Promise<void> {
    // 현재 사용자의 모든 유효한 세션을 폐기한다.
    // 향후 디바이스별 관리가 필요하면 userAgent/ipAddress로 좁힌다.
    await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Refresh Token 회전. 검증 후 기존 세션을 폐기하고 새 세션을 발급한다.
   * 폐기된/만료된 토큰은 401을 반환한다.
   */
  async refresh(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponseDto> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const tokenHash = hashRefreshToken(refreshToken);

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    const now = new Date();
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= now
    ) {
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다');
    }

    // 조건부 update로 토큰을 원자적으로 소비한다. 같은 refresh token으로
    // 동시에 두 요청이 들어오면 정확히 하나만 count=1이 되고, 나머지는 401이다.
    const consumed = await this.prisma.refreshSession.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다');
    }

    return this.issueTokens(user.id, user.role, userAgent, ipAddress);
  }

  async getMe(userId: number): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }
    return this.toUserResponse(user);
  }

  /**
   * N28: 내 프로필 수정 (PATCH /auth/me).
   * name, gender만 수정한다. 소유자는 JWT(sub)로 보장되고, 존재하지 않는
   * 사용자(또는 탈퇴)는 404. 수정 필드가 없으면 400.
   * GET /auth/me와 동일한 UserResponseDto 형태를 반환한다.
   */
  async updateMe(userId: number, dto: UpdateMeDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }

    const hasChanges = dto.name !== undefined || dto.gender !== undefined;
    if (!hasChanges) {
      throw new BadRequestException('수정할 내용이 없습니다 (name 또는 gender)');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name !== undefined ? dto.name : undefined,
        // gender: null이면 미선택으로 초기화한다.
        gender: dto.gender !== undefined ? (dto.gender ?? null) : undefined,
      },
    });

    return this.toUserResponse(updated);
  }

  // ── 내부 헬퍼 ──────────────────────────────────

 private async issueTokens(
   userId: number,
   role: string,
   userAgent?: string,
   ipAddress?: string,
 ): Promise<TokenResponseDto> {
   // jti를 포함해 동일 사용자·동일 초에 발급해도 토큰이 중복되지 않도록 한다.
   const payload: JwtPayload & { jti: string } = {
     sub: userId,
     role,
     jti: randomUUID(),
   };

    // N2: JWT key rotation(kid). 서명 키를 JwtKeyService에서 조회한다.
    // DB에 active 키가 없으면 환경변수 기반 v1 키가 자동 등록된다.
    const accessKey = await this.jwtKeyService.getSigningKey('access');
    const refreshKey = await this.jwtKeyService.getSigningKey('refresh');

   const accessExpiresIn = this.configService.get<string>(
     'ACCESS_TOKEN_EXPIRES_IN',
     '15m',
   );
   const refreshExpiresIn = this.configService.get<string>(
     'REFRESH_TOKEN_EXPIRES_IN',
     '14d',
   );

   const accessToken = await this.jwtService.signAsync(payload, {
      secret: accessKey.secret,
      keyid: accessKey.kid,
     expiresIn: accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
   });

   const refreshToken = await this.jwtService.signAsync(payload, {
      secret: refreshKey.secret,
      keyid: refreshKey.kid,
     expiresIn: refreshExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
   });

   // Refresh Token 해시 저장
   const tokenHash = hashRefreshToken(refreshToken);
   const refreshExpiresInSeconds = expiresInToSeconds(refreshExpiresIn);
   const expiresAt = new Date(Date.now() + refreshExpiresInSeconds * 1000);

   await this.prisma.refreshSession.create({
     data: {
       userId,
       tokenHash,
       userAgent: userAgent ?? null,
       ipAddress: ipAddress ?? null,
       expiresAt,
     },
   });

   return {
     accessToken,
     refreshToken,
     expiresIn: expiresInToSeconds(accessExpiresIn),
   };
 }

 private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    // N2: kid 헤더에서 secret을 찾아 검증. kid가 없거나 미등록이면
    // 기존 환경변수 fallback으로 검증 시도해 호환성을 유지한다.
    const decoded = this.jwtService.decode(token, { complete: true }) as
      | { header?: { kid?: string }; payload?: unknown }
      | null
      | string;
    const kid =
      decoded && typeof decoded === 'object' ? decoded.header?.kid : undefined;
    let refreshSecret: string | undefined;
    if (kid) {
      refreshSecret =
        (await this.jwtKeyService.getVerifyKey(kid, 'refresh')) ?? undefined;
    }
    if (!refreshSecret) {
      refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    }
    if (!refreshSecret) {
      throw new UnauthorizedException('서버 인증 설정 오류입니다');
    }
   try {
     return await this.jwtService.verifyAsync<JwtPayload & { jti?: string }>(
       token,
       {
       secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다');
    }
  }

  
  /**
   * 회원 탈퇴 Soft Delete (N6).
   * PII 즉시 스크럽, 이미지 물리 삭제, 보존 기간 후 purge.
   */
  async withdraw(userId: number): Promise<{ deletedAt: string; purgeAfter: string }> {
    const result = await this.softDelete.withdrawUser(userId, userId);
    return { deletedAt: result.deletedAt, purgeAfter: result.purgeAfter };
  }

  private normalizePhone(phone: string): string {
    return phone.trim().replace(/-/g, '');
  }

  private providerLabel(provider: SocialProviderName): string {
    switch (provider) {
      case 'kakao':
        return '카카오';
      case 'google':
        return '구글';
      case 'apple':
        return '애플';
    }
  }

  private toUserResponse(
    user: {
      id: number;
      phoneNumber: string | null;
      name: string;
      birthDate: Date | null;
      gender: Gender | null;
      role: string;
      createdAt: Date;
    },
    accessToken?: string,
    refreshToken?: string,
    expiresIn?: number,
  ): UserResponseDto {
    const res: UserResponseDto = {
      id: user.id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      // N33: 소셜 계정은 생년월일 입력 전까지 null.
      birthDate: user.birthDate
        ? user.birthDate.toISOString().slice(0, 10)
        : null,
      gender: user.gender as Gender | null,
      createdAt: user.createdAt.toISOString(),
    };
    if (accessToken) {
      res.accessToken = accessToken;
    }
    if (refreshToken) {
      res.refreshToken = refreshToken;
    }
    if (expiresIn !== undefined) {
      res.expiresIn = expiresIn;
    }
    return res;
  }
}

function prismaErrorCode(exception: unknown): string | undefined {
  if (!exception || typeof exception !== 'object') return undefined;
  const code = (exception as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** 생년월일의 실제 달력 날짜·미래 날짜·비현실적인 연령을 함께 검증한다. */
function parseBirthDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(`${value}T00:00:00.000Z`) : new Date('invalid');
  const normalized = Number.isNaN(date.getTime())
    ? ''
    : date.toISOString().slice(0, 10);

  if (!match || normalized !== value) {
    throw new BadRequestException('생년월일 형식이 올바르지 않습니다 (예: 2000-01-01)');
  }

  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const oldestAllowed = new Date(
    Date.UTC(todayUtc.getUTCFullYear() - 120, todayUtc.getUTCMonth(), todayUtc.getUTCDate()),
  );

  if (date > todayUtc) {
    throw new BadRequestException('생년월일은 미래 날짜일 수 없습니다');
  }
  if (date < oldestAllowed) {
    throw new BadRequestException('생년월일은 최근 120년 이내여야 합니다');
  }

  return date;
}
