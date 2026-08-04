import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/**
 * 핸들러/클래스에 필요 권한을 지정한다.
 * @Roles(Role.ADMIN) — ADMIN 전용
 * @Roles(Role.USER, Role.ADMIN) — USER, ADMIN 모두
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
