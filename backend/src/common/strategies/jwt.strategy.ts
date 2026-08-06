import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtKeyService } from '../../modules/auth/jwt-key.service';
import { Role } from '../enums/role.enum';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: number;
  role: string;
}

/**
 * JWT Access Token 검증 전략.
 * Authorization: Bearer <token> 헤더에서 토큰을 추출한다.
 * 검증 후 request.user에 JwtPayload(sub, role)를 주입한다.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtKeyService: JwtKeyService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET이 설정되지 않았습니다');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // N2: kid 기반 JWT key rotation. 토큰 헤더의 kid로 secret을 동적 조회.
      // kid가 없거나 미등록 키면 환경변수 JWT_ACCESS_SECRET으로 fallback해
      // 기존 단일 secret 토큰과의 호환성을 유지한다.
      secretOrKeyProvider: (
        _request: unknown,
        rawToken: string,
        done: (err: unknown, key?: string | Buffer) => void,
      ) => {
        const header = JwtStrategy.decodeHeader(rawToken);
        const kid = header?.kid;
        if (kid) {
          jwtKeyService
            .getVerifyKey(kid, 'access')
            .then((key) => done(null, key ?? secret))
            .catch(() => done(null, secret));
          return;
        }
        done(null, secret);
      },
      algorithms: ['HS256'],
    });
  }

  /** base64url 디코딩으로 JWT 헤더의 kid를 안전하게 추출한다. */
  private static decodeHeader(rawToken: string): { kid?: string } | null {
    try {
      const parts = rawToken.split('.');
      if (parts.length < 2) return null;
      const json = Buffer.from(parts[0], 'base64url').toString('utf8');
      return JSON.parse(json) as { kid?: string };
    } catch {
      return null;
    }
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (
      !payload ||
      !Number.isSafeInteger(payload.sub) ||
      payload.sub <= 0 ||
      !Object.values(Role).includes(payload.role as Role)
    ) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }

    // 토큰 발급 당시의 role을 그대로 신뢰하지 않고 현재 DB role을 반영한다.
    // 운영자가 권한을 내린 뒤에도 기존 access token이 계속 ADMIN으로 남는
    // 권한 고착을 방지한다.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }

    return { sub: user.id, role: user.role };
  }
}
