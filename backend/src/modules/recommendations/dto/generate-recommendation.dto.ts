import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * POST /recommendations/generate 요청.
 *
 * 현재 프론트는 skinScore + weather 전체를 보낸다(기존 FastAPI 계약).
 * 최종 NestJS 계약은 diagnosisId만 받는 방향이지만, 프론트 contract migration이
 * 완료되기 전까지 두 형태를 모두 허용한다.
 *
 * - diagnosisId가 있으면 서버가 diagnosis 소유권 확인 후 DB에서 측정값/날씨를 조회한다(최종 계약).
 * - diagnosisId가 없고 skinScore+weather가 있으면 기존 방식으로 동작한다(호환).
 *
 * TODO(T8): diagnosisId 전용으로 전환하고 skinScore/weather 직접 수신을 제거한다.
 */
export class GenerateRecommendationDto {
  @ApiPropertyOptional({ description: '진단 ID (최종 계약 — 서버가 소유권 확인 후 DB에서 조회)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  diagnosisId?: string;

  @ApiPropertyOptional({
    description: '피부 측정값 스냅샷 (기존 프론트 호환 — diagnosisId 있으면 무시)',
  })
  @IsOptional()
  @IsObject()
  skinScore?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '날씨 스냅샷 (기존 프론트 호환 — diagnosisId 있으면 서버가 DB에서 조회)',
  })
  @IsOptional()
  @IsObject()
  weather?: Record<string, unknown>;
}
