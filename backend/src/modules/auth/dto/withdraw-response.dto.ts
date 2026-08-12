import { ApiProperty } from '@nestjs/swagger';

/** N6 탈퇴 응답 — soft delete 시각과 최종 물리 삭제 예정 시각. */
export class WithdrawResponseDto {
  @ApiProperty({ example: '2026-08-12T12:00:00.000Z' })
  deletedAt!: string;

  @ApiProperty({
    example: '2026-11-10T12:00:00.000Z',
    description: '이 시각 이후 purge 배치가 물리 삭제한다',
  })
  purgeAfter!: string;
}
