import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { EvidenceGrade } from '../enums/evidence-grade.enum';
import { CursorPaginationQueryDto } from '../../../common/pagination/cursor-pagination';

/**
 * GET /recommendations 쿼리 — grade 필터 + 커서 pagination(N6).
 * 전역(user 비종속) 추천만 반환한다.
 */
export class RecommendationQueryDto extends CursorPaginationQueryDto {
  @ApiPropertyOptional({ enum: EvidenceGrade, description: '근거 등급 필터' })
  @IsOptional()
  @IsEnum(EvidenceGrade)
  grade?: EvidenceGrade;
}
