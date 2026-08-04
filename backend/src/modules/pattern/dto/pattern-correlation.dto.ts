import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CorrelationDirection } from '../enums/correlation-direction.enum';
import { CorrelationStrength } from '../enums/correlation-strength.enum';
import { FacePart } from '../../diagnosis/enums/face-part.enum';

/**
 * 단일 상관관계 결과 — 피부 지표와 환경 지표 사이의 선형 상관.
 *
 * 상관계수(r)는 피어슨. sampleSize는 계산에 사용된 진단 샘플 수.
 * 인과관계가 아님을 observationalNote로 명시한다 (고정 문구).
 */
export class PatternCorrelationDto {
  @ApiProperty({
    description: '피부 측정 지표. overallScore 또는 부위별 moisture/elasticity.',
    example: 'overallScore',
  })
  skinMetric!: string;

  @ApiProperty({
    description: '피부 부위. overallScore인 경우 null.',
    enum: FacePart,
    nullable: true,
    example: 'cheek',
  })
  part?: FacePart | null;

  @ApiProperty({ description: '환경 지표. uvIndex/pm25/ozonePpm 등.', example: 'pm25' })
  envMetric!: string;

  @ApiProperty({ type: Number, example: -0.42, description: '피어슨 상관계수 (-1 ~ 1)' })
  r!: number;

  @ApiProperty({ enum: CorrelationDirection, example: CorrelationDirection.NEGATIVE })
  direction!: CorrelationDirection;

  @ApiProperty({ enum: CorrelationStrength, example: CorrelationStrength.MODERATE })
  strength!: CorrelationStrength;

  @ApiProperty({ type: Number, example: 8, description: '계산에 사용된 샘플 수' })
  sampleSize!: number;

  @ApiPropertyOptional({
    description: '상관관계는 인과관계가 아님을 고정 문구로 명시한다.',
    example: '이 관계는 통계적 관찰일 뿐 인과관계를 의미하지 않아요.',
  })
  observationalNote?: string;
}
