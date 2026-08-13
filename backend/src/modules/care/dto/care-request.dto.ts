import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CareWeatherQueryDto {
  @ApiPropertyOptional({ description: '위도 (-90 ~ 90)', example: 37.5665 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: '경도 (-180 ~ 180)', example: 126.978 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon?: number;

  @ApiPropertyOptional({ description: '직전 결과를 무시하고 새로 생성' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  refresh?: boolean;
}

export class CareDiagnosisRequestDto {
  @ApiPropertyOptional({ description: '이 진단 기준으로 생성' })
  @IsString()
  diagnosisId!: string;

  @ApiPropertyOptional({ description: '직전 결과를 무시하고 새로 생성' })
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}
