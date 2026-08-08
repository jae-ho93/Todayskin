import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductDto } from './product.dto';

/**
 * POST /products/weather-based 응답 (N31/N32/N29 rec-fast-path).
 *
 * 기존 ProductDto[] 배열 계약을 래핑해 출처(source)와 LIVE 교체용 jobId를 함께
 * 반환한다. 첫 응답에 실제품이 즉시 오고, job 완료 후 GET /jobs/:id로
 * LIVE 결과로 교체한다. 가상 제품(gemini-product-*)은 어떤 경로에서도 없다.
 */
export class WeatherProductsResponseDto {
  @ApiProperty({ enum: ['CACHED', 'FALLBACK', 'LIVE'], example: 'FALLBACK' })
  source!: 'CACHED' | 'FALLBACK' | 'LIVE';

  @ApiPropertyOptional({
    description: 'LIVE 교체용 job id. CACHED/FALLBACK이면 enqueue된 job, LIVE면 완료된 job.',
  })
  jobId?: string;

  @ApiPropertyOptional({
    description: '이 결과가 만들어진 시각 (CACHED/LIVE). stale 표시용 메타.',
  })
  generatedAt?: string;

  @ApiProperty({ type: [ProductDto], description: '실제 카탈로그 제품 3개 (세안 후/외출 전/외출 후)' })
  items!: ProductDto[];
}
