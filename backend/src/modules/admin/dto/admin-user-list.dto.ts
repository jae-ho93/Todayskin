import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../common/enums/role.enum';

/**
 * ADMIN용 사용자 목록 응답 항목.
 * 민감정보(전화번호)는 마스킹하지 않고 운영자에게 전체 노출.
 */
export class AdminUserItemDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  phoneNumber!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  birthDate!: string;

  @ApiPropertyOptional({ enum: Role })
  role!: Role;

  @ApiProperty()
  createdAt!: string;
}

export class AdminUserListResponseDto {
  @ApiProperty({ type: [AdminUserItemDto] })
  users!: AdminUserItemDto[];

  @ApiProperty()
  total!: number;
}
