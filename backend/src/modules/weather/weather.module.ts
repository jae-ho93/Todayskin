
import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';
import { KmaClient } from './clients/kma.client';
import { AirKoreaClient } from './clients/airkorea.client';
import { StationClient } from './clients/station.client';

/**
 * WeatherModule — T5.
 * 외부 API 호출은 각 Client로 분리하고, 상태 계산은 WeatherStatusPolicy로 분리한다.
 * 영구 저장(WeatherSnapshot DB)은 T6에서 PrismaModule 의존성을 추가해 처리한다.
 */
@Module({
  controllers: [WeatherController],
  providers: [WeatherService, KmaClient, AirKoreaClient, StationClient],
  exports: [WeatherService],
})
export class WeatherModule {}
