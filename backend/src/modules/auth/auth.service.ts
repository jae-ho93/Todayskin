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
import { TokenResponseDto } from './dto/token-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { Gender } from './enums/gender.enum';
import { JwtPayload } from '../../common/strategies/jwt.strategy';

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
  ) {}

  async signup(dto: SignupDto): Promise<UserResponseDto> {
    const phoneNumber = this.normalizePhone(dto.phoneNumber);

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
    return this.toUserResponse(
      user,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresIn,
    );
  }

  async login(dto: LoginDto): Promise<UserResponseDto> {
    const phoneNumber = this.normalizePhone(dto.phoneNumber);

    const user = await this.prisma.user.findUnique({
      where: { phoneNumber },
    });
    if (!user) {
      throw new NotFoundException('가입되지 않은 휴대폰 번호입니다');
    }

    // 기존 FastAPI /auth/login 응답 호환:
    // 프론트는 login 응답을 User 객체로 취급해 id/name/phoneNumber/... 와 accessToken을
    // AsyncStorage에 세션으로 저장한다. 토큰만 반환하면 프론트 호환이 깨지므로
    // User 필드 + 토큰을 함께 반환한다.
    const tokens = await this.issueTokens(user.id, user.role);
    return this.toUserResponse(
      user,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresIn,
    );
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
    if (!user) {
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
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }
    return this.toUserResponse(user);
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

    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const accessExpiresIn = this.configService.get<string>(
      'ACCESS_TOKEN_EXPIRES_IN',
      '15m',
    );
    const refreshExpiresIn = this.configService.get<string>(
      'REFRESH_TOKEN_EXPIRES_IN',
      '14d',
    );

    if (!accessSecret || !refreshSecret) {
      this.logger.error('JWT secret이 설정되지 않았습니다');
      throw new UnauthorizedException('서버 인증 설정 오류입니다');
    }

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: accessSecret,
      expiresIn: accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: refreshSecret,
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
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
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

  private normalizePhone(phone: string): string {
    return phone.trim().replace(/-/g, '');
  }

  private toUserResponse(
    user: {
      id: number;
      phoneNumber: string;
      name: string;
      birthDate: Date;
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
      birthDate: user.birthDate.toISOString().slice(0, 10),
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
