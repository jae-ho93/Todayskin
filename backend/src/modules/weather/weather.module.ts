
import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';
import { WeatherCollectionScheduler } from './weather-collection.scheduler';
import { WeatherWarmupService } from './weather-warmup.service';
import { KmaClient } from './clients/kma.client';
import { AirKoreaClient } from './clients/airkorea.client';
import { StationClient } from './clients/station.client';
import { RedisModule } from '../../redis/redis.module';

/**
 * WeatherModule — T5.
 * 외부 API 호출은 각 Client로 분리하고, 상태 계산은 WeatherStatusPolicy로 분리한다.
 * 영구 저장(WeatherSnapshot DB)은 T6에서 PrismaModule 의존성을 추가해 처리한다.
 * T12: RedisModule(전역)에서 RedisService를 주입받아 날씨 캐시를 적용한다.
 * WeatherCollectionScheduler: 등록된 전체 지역을 주기적으로 수집해, 개인 패턴 분석(T10)이
 * 앱 사용 빈도와 무관하게 그날의 실제 최고치에 가까운 값을 볼 수 있게 한다.
 */
@Module({
 imports: [RedisModule],
 controllers: [WeatherController],
 providers: [
   WeatherService,
   WeatherCollectionScheduler,
   WeatherWarmupService,
   KmaClient,
   AirKoreaClient,
   StationClient,
 ],
 exports: [WeatherService],
})
export class WeatherModule {}
