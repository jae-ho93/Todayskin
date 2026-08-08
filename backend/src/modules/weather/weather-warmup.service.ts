import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeatherService } from './weather.service';

/**
 * N25: 콜드 스타트 워밍.
 *
 * 부팅 직후 기본 지역(서울 종로구) 날씨를 한 번 수집해 Redis 응답 캐시와
 * WeatherSnapshot을 미리 채운다. 첫 `/weather` 요청이 외부 정부 API 왕복
 * (수 초)을 그대로 기다리지 않고 캐시 hit로 즉시 응답할 수 있게 한다.
 *
 * 정부 API 일일 호출 한도를 지키기 위해 스케줄러와 같은
 * WEATHER_COLLECTOR_ENABLED 게이트를 공유한다 (수집 전담 task만 워밍).
 * 실패해도 부팅/요청 경로를 막지 않는다(fire-and-forget + 로그만).
 */
const WARMUP_DELAY_MS = 1_000;

@Injectable()
export class WeatherWarmupService implements OnModuleInit {
  private readonly logger = new Logger(WeatherWarmupService.name);

  constructor(
    private readonly weatherService: WeatherService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    if (this.config.get<string>('WEATHER_COLLECTOR_ENABLED', 'true') === 'false') {
      this.logger.log('Weather warmup skipped (WEATHER_COLLECTOR_ENABLED=false)');
      return;
    }
    const timer = setTimeout(() => {
      void this.warm();
    }, WARMUP_DELAY_MS);
    timer.unref?.();
    this.logger.log(`Weather warmup scheduled in ${WARMUP_DELAY_MS}ms`);
  }

  /**
   * 기본 지역(좌표 없음)은 UV + 대기질이 병렬 수집되고, getCurrentWeather가
   * 결과를 Redis 응답 캐시 + DB에 기록한다. 출처 계약(LIVE/CACHED/UNAVAILABLE)은
   * 기존 로직을 그대로 따른다 — 실패해도 목업 수치를 만들지 않는다.
   */
  private async warm(): Promise<void> {
    try {
      const dto = await this.weatherService.getCurrentWeather();
      this.logger.log(
        `Weather warmup complete (source=${dto.source}, region=${dto.regionName})`,
      );
    } catch (e) {
      this.logger.warn(
        `Weather warmup failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
