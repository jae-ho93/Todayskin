import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

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
  constructor(private readonly configService: ConfigService) {
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

  validate(payload: JwtPayload): JwtPayload {
    if (!payload || typeof payload.sub !== 'number') {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }
    return { sub: payload.sub, role: payload.role };
  }
}
