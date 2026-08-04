import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../strategies/jwt.strategy';

/**
 * 인증된 사용자 정보를 주입받는 파라미터 데코레이터.
 * @CurrentUser() user: JwtPayload
 * JwtAuthGuard가 선행되어 request.user가 채워져 있어야 한다.
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as JwtPayload;
  },
);
