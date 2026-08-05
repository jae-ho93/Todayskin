import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
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
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET이 설정되지 않았습니다');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
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
