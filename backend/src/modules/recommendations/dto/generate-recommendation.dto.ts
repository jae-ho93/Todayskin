import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * POST /recommendations/generate 요청 (N56 — diagnosisId 전용).
 *
 * 서버가 진단 소유권을 확인한 뒤 DB에서 측정값/날씨를 조회해 AI에 전달한다.
 * skinScore/weather 직접 수신은 제거했다 — 클라이언트가 원하는 값을 넣어
 * 추천을 조작하거나 AI 호출 비용을 남용하는 창을 막는다.
 */
export class GenerateRecommendationDto {
  @ApiProperty({ description: '진단 ID — 서버가 소유권 확인 후 DB에서 조회' })
  @IsString()
  @IsNotEmpty()
  diagnosisId!: string;
}
