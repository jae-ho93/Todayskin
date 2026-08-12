import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeaderElectedScheduler } from '../../common/scheduler/leader-elected.scheduler';
import { SchedulerLeaderService } from '../../common/scheduler/scheduler-leader.service';
import { WeatherService } from './weather.service';
import { REGIONS } from './regions/region.registry';

/**
 * 백그라운드 날씨 수집 스케줄러.
 *
 * PatternService의 "그날 가장 심한 UV/오존/미세먼지" 집계는 그날 수집된 WeatherSnapshot
 * 행에서 MAX를 뽑는다. 사용자가 그날 앱을 거의 안 켰다면 수집된 샘플이 적어 실제 최고치와
 * 오차가 커진다. 그래서 사용자 요청과 무관하게 등록된 모든 지역(REGIONS)을 주기적으로
 * 순회하며 스냅샷을 쌓아둔다.
 *
 * 지역 사이에 간격을 두고 순차 호출한다(동시에 쏟아붓지 않음) — 정부 API(기상청/에어코리아)
 * 일일 호출 한도를 아낀다. 기본 간격은 WEATHER_COLLECTION_INTERVAL_MS(기본 1시간)이며,
 * 지역 수(REGIONS.length)만큼 1시간 안에 순차 호출이 몰리므로 지역이 많아지면
 * REGION_STAGGER_MS나 주기를 늘려 조정한다.
 */
const REGION_STAGGER_MS = 3_000;

/**
 * N25: 부팅 직후 첫 수집 시작 지연. 스케줄러 주기(기본 1시간)를 기다리지 않고
 * 콜드 스타트 직후 백그라운드로 한 번 수집을 시작해 DB 히스토리를 미리 채운다.
 * (응답 캐시 워밍은 WeatherWarmupService가 담당)
 */
const INITIAL_TICK_DELAY_MS = 2_000;

@Injectable()
export class WeatherCollectionScheduler extends LeaderElectedScheduler {
  protected readonly logger = new Logger(WeatherCollectionScheduler.name);
  protected readonly schedulerName = 'weather-collection';
  protected readonly intervalEnvKey = 'WEATHER_COLLECTION_INTERVAL_MS';
  protected readonly defaultIntervalMs = 3_600_000;
  protected readonly initialDelayMs = INITIAL_TICK_DELAY_MS;

  constructor(
    private readonly weatherService: WeatherService,
    config: ConfigService,
    leader: SchedulerLeaderService,
  ) {
    super(config, leader);
  }

  /**
   * N21의 수동 스위치. R3의 리더 락이 중복 호출을 막으므로 더는 "정확히 한 task만 true"를
   * 유지할 필요가 없지만, 정부 API 호출을 즉시 끊는 킬 스위치로서 남겨 둔다.
   */
  protected isEnabled(): boolean {
    if (this.config.get<string>('WEATHER_COLLECTOR_ENABLED', 'true') === 'false') {
      this.logger.log('Weather collection scheduler disabled (WEATHER_COLLECTOR_ENABLED=false)');
      return false;
    }
    return true;
  }

  protected async tick(): Promise<void> {
    let ok = 0;
    let failed = 0;
    for (const region of REGIONS) {
      try {
        // N25: 근사표 메타를 넘겨 근접측정소 조회를 생략하고 UV+대기질을 병렬 호출한다
        // (지역별 왕복 1회 단축 + 측정소 조회 API 호출 절약).
        await this.weatherService.getOrCreateSnapshot(region.lat, region.lon, {
          areaNo: region.kmaAreaNo,
          stationName: region.airkoreaStationName,
          regionName: region.cityName,
          cityName: region.cityName,
          districtName: region.districtName,
        });
        ok++;
      } catch (e) {
        failed++;
        this.logger.warn(
          `Collection failed for ${region.name}: ${e instanceof Error ? e.name : String(e)}`,
        );
      }
      await sleep(REGION_STAGGER_MS);
    }
    this.logger.log(`Weather collection tick done: ok=${ok} failed=${failed}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
