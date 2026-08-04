import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../enums/role.enum';
import { JwtPayload } from '../strategies/jwt.strategy';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  function ctx(user?: JwtPayload): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => () => {},
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  it('Roles 메타데이터가 없으면 모든 요청 통과', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(ctx({ sub: 1, role: Role.USER }))).toBe(true);
  });

  it('USER가 USER 권한 API에 접근 시 통과', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.USER]);
    expect(guard.canActivate(ctx({ sub: 1, role: Role.USER }))).toBe(true);
  });

  it('USER가 ADMIN 전용 API에 접근 시 403 Forbidden', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(ctx({ sub: 1, role: Role.USER }))).toThrow(
      ForbiddenException,
    );
  });

  it('ADMIN이 ADMIN 전용 API에 접근 시 통과', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(ctx({ sub: 1, role: Role.ADMIN }))).toBe(true);
  });

  it('ADMIN이 USER+ADMIN 허용 API에 접근 시 통과', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.USER, Role.ADMIN]);
    expect(guard.canActivate(ctx({ sub: 1, role: Role.ADMIN }))).toBe(true);
  });

  it('request.user가 없으면 403 Forbidden (401 인증실패와 구분)', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it('알 수 없는 role은 권한 없음 403', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() =>
      guard.canActivate(ctx({ sub: 1, role: 'UNKNOWN' as never })),
    ).toThrow(ForbiddenException);
  });
});
