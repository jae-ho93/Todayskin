import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../common/enums/role.enum';

/**
 * ADMIN용 사용자 목록 응답 항목.
 * 민감정보(전화번호)는 마스킹하지 않고 운영자에게 전체 노출.
 */
export class AdminUserItemDto {
  @ApiProperty()
  id!: number;

  // N33: 소셜 계정은 전화번호/생년월일이 null일 수 있다.
  @ApiProperty({ nullable: true })
  phoneNumber!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  birthDate!: string | null;

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
