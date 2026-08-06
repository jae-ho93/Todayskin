import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

/**
 * 사용자 역할 변경 요청 DTO (ADMIN 전용).
 */
export class ChangeRoleDto {
  @ApiProperty({ example: 1, description: '대상 사용자 ID' })
  @IsInt()
  @Min(1, { message: 'userId는 1 이상이어야 합니다' })
  userId!: number;

  @ApiProperty({ enum: Role, example: 'ADMIN', description: '새 역할' })
  @IsEnum(Role, { message: 'role은 USER 또는 ADMIN이어야 합니다' })
  role!: Role;
}
