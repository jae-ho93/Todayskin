import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/**
 * N10: orphan 이미지 정리 요청 DTO (ADMIN 전용).
 * dryRun=true(기본)면 탐지만 수행하고 실제 삭제는 하지 않는다.
 */
export class ReconcileImagesDto {
  @ApiProperty({
    example: true,
    description: 'true면 dry-run(탐지만), false면 실제 삭제',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({
    example: 100,
    description: '한 번에 처리할 orphan 객체 수 상한(선택)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
