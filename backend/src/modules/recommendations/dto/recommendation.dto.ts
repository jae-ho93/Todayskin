import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceGrade } from '../enums/evidence-grade.enum';

export type RecommendationTiming = '외출 후' | '자기 전' | '언제든';

/**
 * N45: 추천이 참조하는 실제 문서. 서버 레지스트리(evidence-sources.ts)에
 * 등록된 것만 나온다. 비어 있으면 인용한 문헌이 없다는 뜻이고, 화면은 그
 * 경우를 인용처럼 보이게 하면 안 된다.
 */
export class EvidenceSourceDto {
  @ApiProperty({ example: 'who-uv-index-2002' })
  id!: string;

  @ApiProperty({ example: 'Global Solar UV Index: A Practical Guide' })
  title!: string;

  @ApiProperty({ example: 'World Health Organization' })
  publisher!: string;

  @ApiProperty({ example: 2002 })
  year!: number;

  @ApiProperty({ example: 'https://www.who.int/publications/i/item/9241590076' })
  url!: string;
}

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

  @ApiProperty({
    example: 'AI 생성 · 내 진단 결과 기반',
    description:
      'sources가 비었을 때 쓰는 등급 표기. 인용이 아니라 "무엇으로 만들었는지"를 밝힌다.',
  })
  sourceLabel!: string;

  @ApiProperty({
    type: [EvidenceSourceDto],
    description:
      'N45: 검증된 참조 문서. 빈 배열이면 인용한 문헌이 없다(AI 생성 또는 개인 데이터 관찰).',
  })
  sources!: EvidenceSourceDto[];

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
