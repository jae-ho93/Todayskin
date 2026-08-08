import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecommendationDto } from './recommendation.dto';

/**
 * N32/N29 rec-fast-path 응답 출처 계약.
 * - CACHED: Redis SWR hit — 이전 LIVE 생성 결과를 즉시 반환
 * - FALLBACK: 규칙 기반 실제품 즉시 반환 (LIVE job enqueue와 함께)
 * - LIVE: DB에 저장된 완료된 추천 (job COMPLETED 결과)
 */
export type RecommendationSource = 'CACHED' | 'FALLBACK' | 'LIVE';

/**
 * POST /recommendations/generate/fast 응답.
 * 첫 응답에 실제품이 즉시 오고(source: CACHED | FALLBACK), jobId로
 * GET /jobs/:id를 polling해 LIVE 결과로 교체한다.
 * generatedAt은 stale/갱신 중 메타로 FE가 표시할 수 있게 한다.
 */
export class RecommendationFastResponseDto {
  @ApiProperty({ enum: ['CACHED', 'FALLBACK', 'LIVE'], example: 'FALLBACK' })
  source!: RecommendationSource;

  @ApiPropertyOptional({
    description: 'LIVE 교체용 job id. CACHED/FALLBACK이면 enqueue된 job, LIVE면 완료된 job.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  jobId?: string;

  @ApiPropertyOptional({
    description: '이 결과가 만들어진 시각 (CACHED/LIVE). stale 표시용 메타.',
    example: '2026-08-16T02:00:00.000Z',
  })
  generatedAt?: string;

  @ApiProperty({ type: [RecommendationDto] })
  recommendations!: RecommendationDto[];
}
