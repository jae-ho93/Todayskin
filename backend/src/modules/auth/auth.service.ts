import {
  ConflictException,
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

    const user = await this.prisma.user.create({
      data: {
        phoneNumber,
        name: dto.name.trim(),
        birthDate: new Date(dto.birthDate),
        gender: dto.gender ?? null,
      },
    });

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

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다');
    }

    // 세션 회전 — 기존 토큰 폐기 후 새 토큰 발급
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

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
