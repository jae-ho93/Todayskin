import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceGrade } from '../enums/evidence-grade.enum';

export type RecommendationTiming = '외출 후' | '자기 전' | '언제든';

/**
 * Recommendation 응답 — 기존 FastAPI Recommendation(camelCase) 계약 유지.
 * grade, sourceLabel은 서버가 고정한다 (LLM이 결정하지 않음).
 */
export class RecommendationDto {
  @ApiProperty({ example: 'gemini-a1b2c3d4' })
  id!: string;

  @ApiProperty({ example: '오늘은 이중 세안을 권장해요' })
  title!: string;

  @ApiProperty({ enum: EvidenceGrade, example: EvidenceGrade.B })
  grade!: EvidenceGrade;

  @ApiProperty({ example: 'AI 종합 분석 · 피부과학 일반 지식 기반' })
  sourceLabel!: string;

  @ApiProperty({
    example:
      '초미세먼지 노출은 모공에 침투해 활성산소를 생성할 수 있다는 관찰 연구 결과가 있습니다.',
  })
  explanation!: string;

  @ApiPropertyOptional({
    type: String,
    example: '통계적 관찰 - 확정적 인과관계 아님',
    nullable: true,
  })
  observationalNote?: string | null;

  @ApiProperty({ type: [String], example: ['세라마이드', '판테놀'] })
  ingredientTags!: string[];

  @ApiProperty({
    type: [String],
    example: [],
    description: '연결된 제품 ID 목록 (호환용 빈 배열)',
  })
  relatedProductIds!: string[];

  @ApiPropertyOptional({
    enum: ['외출 후', '자기 전', '언제든'],
    description: '언제 적용하면 좋은지',
    nullable: true,
  })
  timing?: RecommendationTiming | null;
}
