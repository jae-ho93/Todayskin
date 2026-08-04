import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PatternStatus } from '../enums/pattern-status.enum';
import { PatternCorrelationDto } from './pattern-correlation.dto';

/**
 * 개인 패턴 분석 응답.
 *
 * status가 LOCKED면 correlations와 recommendationIds는 빈 배열이고
 * collectedDays/requiredDays만 채운다.
 * READY면 correlations에 상관 분석 결과를, recommendationIds에 C등급 추천 id를 담는다.
 *
 * 고정 문구:
 * - LOCKED 문구는 준비 중 상태용 고정 텍스트.
 * - READY의 경우 인과/상관 구분 문구를 observationalDisclaimer에 고정.
 */
export class PatternSummaryDto {
  @ApiProperty({ enum: PatternStatus, example: PatternStatus.LOCKED })
  status!: PatternStatus;

  @ApiProperty({
    type: Number,
    example: 3,
    description: '현재까지 수집된 진단 일수 (LOCKED/READY 공통).',
  })
  collectedDays!: number;

  @ApiProperty({
    type: Number,
    example: 7,
    description: '분석에 필요한 최소 진단 일수. LOCKED일 때만 의미.',
  })
  requiredDays!: number;

  @ApiPropertyOptional({
    description: 'LOCKED 상태에서 보여줄 준비 중 문구 (고정).',
    example: '패턴 분석에는 최소 5회의 진단 데이터가 필요해요.',
  })
  lockedMessage?: string;

  @ApiPropertyOptional({
    description: 'READY일 때 인과관계가 아님을 명시하는 고정 문구.',
    example: '이 결과는 통계적 관찰일 뿐 인과관계를 의미하지 않아요.',
  })
  observationalDisclaimer?: string;

  @ApiProperty({ type: [PatternCorrelationDto], description: '상관 분석 결과 (READY일 때만).' })
  correlations!: PatternCorrelationDto[];

  @ApiProperty({
    type: [String],
    description: '패턴과 짝을 이루는 C등급 추천 id (READY일 때만).',
  })
  recommendationIds!: string[];
}
