import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { EvidenceGrade } from '../enums/evidence-grade.enum';

/**
 * GET /recommendations 쿼리 — grade 필터.
 * 전역(user 비종속) 추천만 반환한다.
 */
export class RecommendationQueryDto {
  @ApiPropertyOptional({ enum: EvidenceGrade, description: '근거 등급 필터' })
  @IsOptional()
  @IsEnum(EvidenceGrade)
  grade?: EvidenceGrade;
}
