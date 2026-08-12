import { ApiProperty } from '@nestjs/swagger';

/**
 * N6/N44 탈퇴 응답 — 탈퇴 시각과 계정 껍데기의 최종 삭제 예정 시각.
 * 진단 결과·사진·추천은 deletedAt 시점에 이미 물리 삭제된다.
 */
export class WithdrawResponseDto {
  @ApiProperty({ example: '2026-08-12T12:00:00.000Z' })
  deletedAt!: string;

  @ApiProperty({
    example: '2026-11-10T12:00:00.000Z',
    description: '이 시각 이후 purge 배치가 계정 row를 물리 삭제한다',
  })
  purgeAfter!: string;
}
