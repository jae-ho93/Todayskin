
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { WeatherService } from './weather.service';
import { WeatherSnapshotDto } from './dto/weather-snapshot.dto';

/**
 * GET /weather 쿼리 DTO — lat/lon은 선택.
 * 위치 권한 허용 시 프론트가 GPS 좌표를 전달한다.
 */
export class WeatherQueryDto {
  @ApiPropertyOptional({ type: Number, example: 37.5665, description: '위도' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ type: Number, example: 126.978, description: '경도' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon?: number;
}

/**
 * WeatherController — 기존 FastAPI GET /weather 이식.
 * HTTP 처리만 담당하고 비즈니스 로직은 WeatherService에 둔다.
 */
@ApiTags('weather')
@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  @ApiOperation({
    summary: '현재 날씨 스냅샷 (자외선 + 대기오염)',
    description:
      '기상청 자외선 + 에어코리아 대기오염 결합 스냅샷. lat/lon이 있으면 근접 지역, 없으면 기본 지역. 각 지표는 API 실패 시 null(측정 불가)로 응답한다.',
  })
  async getCurrentWeather(
    @Query() query: WeatherQueryDto,
  ): Promise<WeatherSnapshotDto> {
    return this.weatherService.getCurrentWeather(query.lat, query.lon);
  }
}
