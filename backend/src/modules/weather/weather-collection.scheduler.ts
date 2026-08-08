import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
export class WeatherCollectionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeatherCollectionScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly weatherService: WeatherService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    // N21: ECS에서 task가 여러 개 뜨면 각 task마다 스케줄러가 실행돼 정부 API를
    // 중복 호출한다. WEATHER_COLLECTOR_ENABLED=false로 설정한 task는 스케줄러를 끈다
    // (배포 시 정확히 1개 task만 true로 유지 — DEPLOYMENT.md 참고).
    if (this.config.get<string>('WEATHER_COLLECTOR_ENABLED', 'true') === 'false') {
      this.logger.log('Weather collection scheduler disabled (WEATHER_COLLECTOR_ENABLED=false)');
      return;
    }
    const interval = Number(
      this.config.get<number>('WEATHER_COLLECTION_INTERVAL_MS') ?? 3_600_000,
    );
    if (!interval || interval <= 0) {
      this.logger.log('Weather collection scheduler disabled');
      return;
    }
    this.timer = setInterval(() => {
      void this.collectAllRegions();
    }, interval);
    this.timer.unref?.();
    // N25: 콜드 스타트 워밍 — 첫 주기를 기다리지 않고 부팅 직후 한 번 수집을 시작한다.
    // 실행은 비동기(fire-and-forget)라 부팅 경로를 막지 않는다.
    const initialTick = setTimeout(() => {
      void this.collectAllRegions();
    }, INITIAL_TICK_DELAY_MS);
    initialTick.unref?.();
    this.logger.log(
      `Weather collection scheduler started intervalMs=${interval} regions=${REGIONS.length} warmup=${INITIAL_TICK_DELAY_MS}ms`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async collectAllRegions(): Promise<void> {
    // 이전 실행이 아직 안 끝났으면(외부 API가 느릴 때) 겹쳐 돌지 않는다.
    if (this.running) {
      this.logger.warn('Previous collection still running, skipping this tick');
      return;
    }
    this.running = true;
    let ok = 0;
    let failed = 0;
    try {
      for (const region of REGIONS) {
        try {
          // N25: 근사표 메타를 넘겨 근접측정소 조회를 생략하고 UV+대기질을 병렬 호출한다
          // (지역별 왕복 1회 단축 + 측정소 조회 API 호출 절약).
          await this.weatherService.getOrCreateSnapshot(region.lat, region.lon, {
            areaNo: region.kmaAreaNo,
            stationName: region.airkoreaStationName,
            regionName: region.cityName,
            cityName: region.cityName,
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
    } finally {
      this.running = false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
