import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * 날씨 기반 제품 추천 요청 (N12 — 서버 소유 날씨 계약).
 *
 * 클라이언트는 날씨 데이터를 보내지 않고 좌표만 보낸다. 서버가 WeatherService와
 * 최근 WeatherSnapshot에서 오늘 날씨를 직접 구성하므로, 조작된 날씨로 추천을
 * 왜곡할 수 없다. 좌표가 없으면 기본 지역 기준으로 서버가 조회한다.
 */
export class WeatherBasedRequestDto {
  @ApiPropertyOptional({ description: '위도 (-90 ~ 90)', example: 37.5665 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: '경도 (-180 ~ 180)', example: 126.978 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon?: number;
}
