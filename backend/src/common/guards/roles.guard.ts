import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { JwtPayload } from '../strategies/jwt.strategy';

/**
 * 권한 검사 가드. @Roles(...) 데코레이터로 지정된 권한이 있어야 접근 가능.
 * 인증은 JwtAuthGuard가 선행해야 한다(request.user가 존재).
 * 권한 부족 시 403 Forbidden (401 인증실패와 구분).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = request.user;

    if (!user) {
      throw new ForbiddenException('권한이 없습니다');
    }

    if (!requiredRoles.includes(user.role as Role)) {
      throw new ForbiddenException('접근 권한이 없습니다');
    }

    return true;
  }
}
