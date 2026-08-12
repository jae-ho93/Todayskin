import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { errorName } from '../../common/errors/error-name.util';
import {
  assignWeatherMetrics,
  metricsFromCollected,
} from './mappers/weather-snapshot.mapper';
import { weatherCacheKey } from './weather-cache';
import {
  KmaClient,
  NowcastWithTime,
  UvForecastWithTime,
} from './clients/kma.client';
import {
  AirKoreaClient,
  AirQualityDataWithTime,
} from './clients/airkorea.client';
import { StationClient } from './clients/station.client';
import { WeatherStatusPolicy } from './policies/weather-status.policy';
import {
  DEFAULT_REGION,
  findNearestRegion,
} from './regions/region.registry';
import { WeatherSnapshotDto } from './dto/weather-snapshot.dto';
import { WeatherSource } from '../../common/enums/weather-source.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { WeatherSnapshot } from '@prisma/client';

// 지표가 하나라도 null인 degraded 결과의 캐시 TTL(초). 기본 TTL(5분)보다 훨씬 짧게 둬서
// 일시적인 외부 API 실패(예: 에어코리아 504)가 "측정 불가"를 오래 재생시키지 않게 한다.
const DEGRADED_CACHE_TTL_SECONDS = 30;

/**
 * N42: 진단 경로에서만 켜는 재시도 횟수. 이 경로의 결과는 영구 저장되고 캐시가
 * 흡수해 주지도 않아, 일시 실패 한 번이 그 기록에 영원히 남는다. 응답 경로는
 * 0을 유지한다 — 외부 API가 느릴 때 모든 사용자의 지연이 배로 늘어난다.
 */
const DIAGNOSIS_RETRY_COUNT = 1;

/**
 * 영구 저장용으로 수집한 메타데이터. 응답용 DTO와 달리 지역/측정소/좌표를 포함한다.
 */
interface CollectedWeather {
  uv: UvForecastWithTime;
  air: AirQualityDataWithTime;
  /** N53: 초단기실황(기온·습도). */
  nowcast: NowcastWithTime;
  regionName: string;
  /** F56: 시/군/구 표시명 (예: "해운대구"). 없으면 null. */
  districtName: string | null;
  kmaAreaNo: string;
  airkoreaStation: string;
  lat: number | null;
  lon: number | null;
  cityName: string | null;
  /**
   * N41: 근접측정소 조회가 실패해 대표 측정소로 대체됐는지. 이 결과는 구 이름이
   * 비어 있고 대기질도 다른 동네 값일 수 있어, 캐시에 오래 두면 그 지역 사용자
   * 전원이 같은 오답을 본다(캐시 키가 좌표를 소수 2자리로 뭉치기 때문).
   */
  stationLookupFailed: boolean;
}

/**
 * N25: 지역 근사표에서 이미 확보한 메타데이터.
 * 스케줄러 워밍처럼 areaNo/측정소명을 이미 알면 근접측정소 조회를 생략하고
 * UV + 대기질을 병렬로 수집한다.
 */
export interface RegionMeta {
  areaNo: string;
  stationName: string;
  regionName: string;
  cityName: string | null;
  /** 표시용 시/군/구. 광역 단위라 특정할 수 없으면 null (N41). */
  districtName: string | null;
}

/**
 * WeatherService — 기상청 자외선 + 에어코리아 대기오염을 결합한 실시간 스냅샷.
 * 기존 FastAPI get_current_weather 로직 이식 + T6 날씨 이력 저장.
 *
 * lat/lon이 주어지면(위치 권한 허용) 가장 가까운 지역의 관측소·행정구역코드를 찾고,
 * 없으면(권한 거부) 환경변수 기본 지역으로 조회한다.
 *
 * 각 필드는 독립적으로 실패할 수 있다 — 키가 없거나 호출이 실패하면 그 항목만
 * null로 응답한다(목업으로 대체하지 않는다. 프론트에서 "측정 불가"로 표시).
 *
 * T6: 수집한 스냅샷은 WeatherSnapshot 테이블에 영구 저장한다.
 *   - 관측 시각(observedAt): 외부 API의 발표/측정 시각. UV는 queryTime(KST), 대기는 dataTime(KST).
 *     두 출처의 시각이 다르면 더 최근 값을 사용한다.
 *   - 서버 수집 시각(collectedAt): DB 기본값 now().
 *   - 중복 저장 방지: 동일 (regionName, kmaAreaNo, airkoreaStation, observedAt) 조합의
 *     최근 row가 있으면 재사용(get-or-create).
 *   - UNAVAILABLE(모든 지표 null)은 저장하지 않는다. 재현 가치가 없기 때문.
 *   - Diagnosis 연결은 T9에서 weatherSnapshotId를 쓴다. 여기서는 getSnapshotById만 제공.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly policy = new WeatherStatusPolicy();
  private readonly defaultKmaAreaNo: string;
  private readonly defaultStationName: string;

  constructor(
   private readonly kmaClient: KmaClient,
   private readonly airKoreaClient: AirKoreaClient,
   private readonly stationClient: StationClient,
   private readonly configService: ConfigService,
   private readonly prisma: PrismaService,
   private readonly redisService: RedisService,
  ) {
    // 위치 권한 거부 또는 근접측정소 조회 실패 시 폴백용 기본 지역.
    // 환경변수가 없으면 REGIONS 기본값(서울 종로구)을 사용한다.
    this.defaultKmaAreaNo = this.configService.get<string>(
      'KMA_AREA_NO',
      DEFAULT_REGION.kmaAreaNo,
    );
    this.defaultStationName = this.configService.get<string>(
      'AIRKOREA_STATION_NAME',
      DEFAULT_REGION.airkoreaStationName,
    );
  }

  async getCurrentWeather(
    lat?: number,
    lon?: number,
  ): Promise<WeatherSnapshotDto> {
    // T12: Redis 캐시 조회. 동일 지역·근접 좌표의 반복 요청은 외부 API를 치지 않는다.
    // 진단용 getOrCreateSnapshot과 달리 응답용은 약간의 지연(최대 TTL)을 허용한다.
    const cacheKey = this.resolveCacheKey(lat, lon);
    const cached = await this.tryCache(cacheKey);
    if (cached) {
      this.logger.debug(`Weather cache hit: ${cacheKey}`);
      await this.recordCacheMetric('hit');
      return cached;
    }
    await this.recordCacheMetric('miss');

    const collected = await this.collect(lat, lon);
    const dto = this.buildSnapshotDto(collected);
    await this.persist(collected).catch((e) => {
      // 저장 실패가 응답 자체를 막아서는 안 된다. 로깅만 하고 계속.
      this.logger.warn(`WeatherSnapshot persist failed: ${errorName(e)}`);
    });

    // LIVE 수집 결과를 캐시에 기록. UNAVAILABLE도 캐싱해 짧은 시간 내
    // 외부 API 연쇄 실패 시 동일 응답을 반환한다(외부 API 보호).
    await this.saveCache(cacheKey, dto, collected.stationLookupFailed);
    return dto;
  }

  /**
   * 진단/추천 모듈이 기존 스냅샷을 참조할 때 사용.
   * Diagnosis.weatherSnapshotId 연결은 T9에서, 소유권 검사와 함께 처리한다.
   */
 async getSnapshotById(id: string): Promise<WeatherSnapshot | null> {
   return this.prisma.weatherSnapshot.findUnique({ where: { id } });
 }

  /**
   * 진단/추천 생성(T9/T7)이 "이 진단이 어떤 환경 데이터에 기반했는가"를
   * 추적하기 위해 스냅샷을 확보하고 그 식별자를 반환한다.
   *
   * 동작:
   *   1. 외부 API에서 수집(collect)한다.
   *   2. persist(get-or-create)로 DB에 저장(또는 동일 관측시각 row 재사용).
   *   3. 저장된 row의 id를 반환한다.
   *
   * UNAVAILABLE(모든 지표 null)이면 null을 반환한다.
   * 진단은 환경 데이터 없이도 진행될 수 있어야 하므로, snapshot 부재가
   * 진단 자체를 실패시키지 않는다(연결은 선택). 소유권 검사는 진단 쪽에서.
   *
   * 저장 실패 시 null을 반환하지 않고 예외를 전파한다 — 호출자(진단 서비스)가
   * 트랜잭션에서 이 메서드를 쓸 때 실패를 감지해야 하기 때문.
   */
  async getOrCreateSnapshot(
    lat?: number,
    lon?: number,
    meta?: RegionMeta,
  ): Promise<WeatherSnapshot | null> {
    // T12: 진단/추천 연결용은 캐시를 사용하지 않는다. 재현성·정확성이 캐시 지연보다 중요.
    // N25: 스케줄러 워밍은 meta를 넘겨 근접측정소 조회를 생략하고 병렬 수집한다.
    //
    // N42: 이 경로의 결과는 진단 기록에 영구히 남는다. 캐시가 없으니 일시 실패를
    // 흡수해 줄 것도 없어, 한 번의 타임아웃이 그 기록의 날씨를 영원히 비운다.
    // 진단은 하루 몇 건 수준이라 재시도 비용이 거의 없다 — 여기서만 켠다.
    const collected = await this.collect(lat, lon, meta, DIAGNOSIS_RETRY_COUNT);
    await this.recordCollectionFailureMetric(collected);
    return this.persist(collected);
  }

  /**
   * 외부 API 호출과 메타데이터 수집. 저장하지 않고 raw 결과만 반환한다.
   * 테스트와 persist 분리를 위해 별도 메서드로 둔다.
   *
   * N25 병렬화 정책:
   * - meta(근사표 지역 메타) 제공 시: 근접측정소 조회 없이 UV + 대기질을 병렬 호출.
   * - 좌표 제공 시: 근접측정소 조회와 UV는 서로 독립이라 병렬 호출. 대기질은
   *   측정소명이 필요하므로 그 뒤에 호출한다(필수 의존성).
   * - 좌표 없음(기본 지역): UV + 대기질을 병렬 호출.
   */
  private async collect(
    lat?: number,
    lon?: number,
    meta?: RegionMeta,
    retries = 0,
  ): Promise<CollectedWeather> {
    // N41: 세 분기가 각자 완전한 객체를 반환한다. 예전에는 `let`에 나눠 대입해서
    // 한 분기가 `districtName`을 빠뜨려도 컴파일러가 잡지 못했고, 실제로 스케줄러
    // 경로 스냅샷의 구 이름이 전부 null이었다.
    const location = { lat: lat ?? null, lon: lon ?? null };

    if (meta) {
      // N53: 스케줄러는 근사표 좌표를 항상 넘긴다. 혹시 없으면 기본 지역 좌표로.
      const [uv, air, nowcast] = await Promise.all([
        this.kmaClient.fetchUvIndex(meta.areaNo, retries),
        this.airKoreaClient.fetchAirQuality(meta.stationName, retries),
        this.kmaClient.fetchNowcast(
          lat ?? DEFAULT_REGION.lat,
          lon ?? DEFAULT_REGION.lon,
          retries,
        ),
      ]);
      return {
        uv,
        air,
        nowcast,
        regionName: meta.regionName,
        districtName: meta.districtName,
        kmaAreaNo: meta.areaNo,
        airkoreaStation: meta.stationName,
        ...location,
        cityName: meta.cityName ?? null,
        stationLookupFailed: false,
      };
    }

    if (lat !== undefined && lon !== undefined) {
      const region = findNearestRegion(lat, lon);
      // 자외선지수 조회는 근접측정소 조회 결과와 무관(areaNo만 필요)하므로
      // 순차 대기하지 않고 병렬로 실행해 두 정부 API 모두 느릴 때의 왕복 시간을 줄인다.
      // N53: 초단기실황도 좌표만 있으면 되므로 같은 병렬 묶음에 넣는다.
      const [nearest, uv, nowcast] = await Promise.all([
        this.stationClient.fetchNearestStation(lat, lon, retries),
        this.kmaClient.fetchUvIndex(region.kmaAreaNo, retries),
        this.kmaClient.fetchNowcast(lat, lon, retries),
      ]);

      // 측정소 조회가 실패하면 근사표의 대표 측정소로 대기질을 조회한다. 이건
      // 데이터 출처의 폴백이라 타당하다. 반면 **구 이름은 폴백하지 않는다** —
      // 측정소명은 행정구역이 아니고('인계동' 같은 동 이름도 있다), 실제로
      // 해운대구가 부산 대표 측정소명인 '중구'로 표시됐다. 모르면 비운다.
      const stationName = nearest?.stationName ?? region.airkoreaStationName;
      if (!nearest) {
        this.logger.warn(
          `Nearest station lookup failed (lat=${lat}, lon=${lon}); ` +
            `falling back to station "${stationName}", district left empty`,
        );
      }

      return {
        uv,
        air: await this.airKoreaClient.fetchAirQuality(stationName, retries),
        nowcast,
        // F56: 시/도는 근사표의 정식 명칭(예: '부산광역시'), 구/군은 최인접 측정소
        // 주소 토큰(예: '해운대구').
        regionName: region.cityName,
        districtName: nearest?.districtName ?? null,
        kmaAreaNo: region.kmaAreaNo,
        airkoreaStation: stationName,
        ...location,
        cityName: nearest?.cityName ?? null,
        stationLookupFailed: !nearest,
      };
    }

    // N25: 기본 지역은 두 외부 API가 서로 독립이므로 병렬 호출한다.
    // N53: 기본 지역 좌표는 근사표(서울 종로구)의 것을 쓴다. KMA_AREA_NO를 다른
    // 지역으로 override한 배포에서는 실황 좌표가 어긋날 수 있다 — 그 경우
    // 좌표 없는 요청 자체가 드물고, 정확한 사용자 좌표 요청은 위 분기를 탄다.
    const [uv, air, nowcast] = await Promise.all([
      this.kmaClient.fetchUvIndex(this.defaultKmaAreaNo, retries),
      this.airKoreaClient.fetchAirQuality(this.defaultStationName, retries),
      this.kmaClient.fetchNowcast(DEFAULT_REGION.lat, DEFAULT_REGION.lon, retries),
    ]);
    return {
      uv,
      air,
      nowcast,
      regionName: DEFAULT_REGION.cityName,
      // 위치 권한이 없어 기본 지역으로 조회한 것이므로 사용자의 구를 알 수 없다.
      districtName: null,
      kmaAreaNo: this.defaultKmaAreaNo,
      airkoreaStation: this.defaultStationName,
      ...location,
      cityName: null,
      stationLookupFailed: false,
    };
  }

  private buildSnapshotDto(c: CollectedWeather): WeatherSnapshotDto {
    const dto = new WeatherSnapshotDto();
    dto.observedAt = this.resolveObservedAt(c).toISOString();
    dto.regionName = c.regionName;
    dto.districtName = c.districtName;
    dto.source = this.resolveSource(c.uv, c.air, c.nowcast);
    dto.uvCollectionFailed = c.uv.failed;
    dto.airCollectionFailed = c.air.failed;
    dto.nowcastCollectionFailed = c.nowcast.failed;
    return assignWeatherMetrics(dto, metricsFromCollected(c, this.policy));
  }

  // ── T12 Redis 캐시 헬퍼 ──────────────────────────────

  /**
   * 캐시 키 계산. 좌표가 있으면 좌표 기반, 없으면 기본 지역 기반.
   * 좌표는 소수점 2자리로 그룹화해 GPS 미세 오차의 hit 감소를 막는다.
   */
  private resolveCacheKey(lat?: number, lon?: number): string {
    if (lat !== undefined && lon !== undefined) {
      return weatherCacheKey('coord', lat, lon);
    }
    return weatherCacheKey(this.defaultRegionName());
  }

  private defaultRegionName(): string {
    return DEFAULT_REGION.cityName;
  }

  /**
   * N11: 날씨 캐시 hit/miss 지표를 Redis 카운터에 누적한다.
   * Redis 장애 시 조용히 무시(지표 수집이 응답 경로를 방해하지 않음).
   */
  private async recordCacheMetric(kind: 'hit' | 'miss'): Promise<void> {
    // incrementCounter는 내부에서 예외를 삼키고 null을 반환한다(응답 경로 비차단).
    await this.redisService.incrementCounter(`metric:weather:cache:${kind}`);
  }

  /**
   * N42: 진단 스냅샷의 수집 실패율. 예전에는 실패가 조용히 null이 되어
   * 얼마나 자주 일어나는지 알 수 없었다 — 재시도가 효과가 있는지도 알 수 없다.
   */
  private async recordCollectionFailureMetric(c: CollectedWeather): Promise<void> {
    await this.redisService.incrementCounter('metric:weather:collect:total');
    if (c.uv.failed) {
      await this.redisService.incrementCounter('metric:weather:collect:uv_failed');
    }
    if (c.air.failed) {
      await this.redisService.incrementCounter('metric:weather:collect:air_failed');
    }
    if (c.nowcast.failed) {
      await this.redisService.incrementCounter(
        'metric:weather:collect:nowcast_failed',
      );
    }
    if (c.stationLookupFailed) {
      await this.redisService.incrementCounter(
        'metric:weather:collect:station_failed',
      );
    }
  }

  /**
   * 캐시 조회. hit 시 source를 CACHED로 override하고 DTO 인스턴스로 복원한다.
   * Redis 장애 또는 키 부재 시 null 반환 — 호출부가 외부 API fallback으로 진행.
   */
  private async tryCache(key: string): Promise<WeatherSnapshotDto | null> {
    if (!this.redisService.isAvailable()) return null;
    const cached = await this.redisService.getJson<CachedWeatherPayload>(key);
    if (!cached) return null;
    return this.dtoFromCache(cached.dto);
  }

  /**
   * 캐시 저장. LIVE/UNAVAILABLE 모두 캐싱해 외부 API 보호.
   * 저장 실패는 조용히 무시(다음 요청이 외부 API를 친다).
   *
   * 지표가 하나라도 null(예: 에어코리아만 일시적으로 504)인 결과는 기본 TTL(5분) 대신 짧은 TTL로
   * 캐싱한다 — 그대로 두면 잠깐의 외부 API 오류 하나가 "측정 불가"를 5분 내내 그대로 재생시킨다.
   * 완전히 성공한 결과만 기본 TTL을 그대로 쓴다.
   *
   * N41: 측정소 조회 실패도 degraded로 본다. 지표는 다 채워졌더라도 그 값은 대표 측정소의
   * 것이라 사용자 동네와 다를 수 있다. 캐시 키가 좌표를 소수 2자리로 뭉치기 때문에
   * 이런 결과가 기본 TTL로 들어가면 그 일대 사용자 전원이 5분간 같은 오답을 본다.
   */
  private async saveCache(
    key: string,
    dto: WeatherSnapshotDto,
    stationLookupFailed = false,
  ): Promise<void> {
    if (!this.redisService.isAvailable()) return;
    const payload: CachedWeatherPayload = {
      dto: { ...dto },
      cachedAt: new Date().toISOString(),
    };
    const degraded = stationLookupFailed || this.isDegraded(dto);
    const ttl = degraded ? DEGRADED_CACHE_TTL_SECONDS : undefined;
    await this.redisService.setJson(key, payload, ttl);
  }

  /** 핵심 지표 중 하나라도 null이면 degraded로 본다(일부 외부 API만 실패한 경우 포함). */
  private isDegraded(dto: WeatherSnapshotDto): boolean {
    return (
      dto.uvIndex === null ||
      dto.uvIndex === undefined ||
      dto.ozonePpm === null ||
      dto.ozonePpm === undefined ||
      dto.pm25 === null ||
      dto.pm25 === undefined ||
      dto.pm10 === null ||
      dto.pm10 === undefined
    );
  }

  /** 캐시에서 복원한 객체를 DTO 인스턴스로 복구하고 source를 CACHED로 override. */
  private dtoFromCache(raw: WeatherSnapshotDto): WeatherSnapshotDto {
    const dto = new WeatherSnapshotDto();
    Object.assign(dto, raw);
    dto.source = WeatherSource.CACHED;
    return dto;
  }

  /**
   * 출처 판단 — 모든 주요 지표가 unavailable이면 UNAVAILABLE,
   * 하나라도 값이 있으면 LIVE(현재는 실시간 수집만 하므로).
   * Redis 캐시(T12)가 도입되면 CACHED 케이스가 추가된다.
   */
  private resolveSource(
    uv: UvForecastWithTime,
    air: AirQualityDataWithTime,
    nowcast: NowcastWithTime,
  ): WeatherSource {
    const anyUv = uv.current !== null || uv.peak !== null;
    const anyAir =
      air.ozone !== null ||
      air.pm25 !== null ||
      air.pm10 !== null ||
      air.cai !== null ||
      air.no2 !== null ||
      air.so2 !== null ||
      air.co !== null;
    // N53: 기온·습도만 살아 있어도 저장 가치가 있다(피부 건조와 직결).
    const anyNowcast =
      nowcast.temperature !== null || nowcast.humidity !== null;
    return anyUv || anyAir || anyNowcast
      ? WeatherSource.LIVE
      : WeatherSource.UNAVAILABLE;
  }

  /**
   * 관측 시각 — UV와 대기질의 발표 시각이 다를 수 있다.
   * 두 값이 모두 있으면 더 최근(늦은) 시각을, 하나만 있으면 그것을,
   * 둘 다 없으면 현재 서버 시각을 관측 시각으로 둔다.
   * (둘 다 없는 경우는 UNAVAILABLE이지만 응답용 observedAt은 채워야 한다.)
   */
  private resolveObservedAt(c: CollectedWeather): Date {
    // N53: 초단기실황 발표 시각도 후보에 넣는다 — 셋 중 가장 최근 시각.
    const candidates = [c.uv.observedAt, c.air.observedAt, c.nowcast.observedAt]
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime());
    return candidates[0] ?? new Date();
  }

  /**
   * WeatherSnapshot 영구 저장(get-or-create).
   * - UNAVAILABLE(모든 지표 null)은 저장하지 않는다.
   * - 동일 (regionName, kmaAreaNo, airkoreaStation, observedAt)의 최근 row가 있으면 재사용.
   *   관측 시각이 같으면 같은 발표 자료로 간주해 중복 row를 만들지 않는다.
   * - 동일 시각이라도 UV/대기 출처 시각이 미세하게 다를 수 있으므로, observedAt을
   *   분 단위로 절삭해 비교한다(에어코리아 dataTime은 분 단위, KMA는 시간 단위).
   */
  private async persist(c: CollectedWeather): Promise<WeatherSnapshot | null> {
    const source = this.resolveSource(c.uv, c.air, c.nowcast);
    if (source === WeatherSource.UNAVAILABLE) {
      this.logger.debug('WeatherSnapshot skipped: UNAVAILABLE');
      return null;
    }

    const observedAt = this.resolveObservedAt(c);
    const observedAtTrunc = truncateToMinute(observedAt);

    return this.prisma.$transaction(async (tx) => {
      // find-then-create만으로는 동시 요청이 같은 발표 자료를 중복 저장할
      // 수 있다. 지역/관측분 단위 advisory lock으로 이 짧은 구간을 직렬화한다.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`todayskin:weather:${c.regionName}:${c.kmaAreaNo}:${c.airkoreaStation}:${observedAtTrunc.toISOString()}`}))`;

      // 초 단위 오차가 있는 외부 시각도 같은 관측 분으로 dedup하되, 저장되는
      // observedAt은 원본 시각을 보존한다.
      const nextMinute = new Date(observedAtTrunc.getTime() + 60_000);
      const existing = await tx.weatherSnapshot.findFirst({
        where: {
          regionName: c.regionName,
          kmaAreaNo: c.kmaAreaNo,
          airkoreaStation: c.airkoreaStation,
          observedAt: { gte: observedAtTrunc, lt: nextMinute },
        },
        orderBy: { collectedAt: 'desc' },
      });
      if (existing) {
        this.logger.debug(`WeatherSnapshot reused: ${existing.id}`);
        return existing;
      }

      return tx.weatherSnapshot.create({
        data: {
          observedAt,
          regionName: c.regionName,
          cityName: c.cityName,
          districtName: c.districtName,
          latitude: c.lat,
          longitude: c.lon,
          kmaAreaNo: c.kmaAreaNo,
          airkoreaStation: c.airkoreaStation,
          ...metricsFromCollected(c, this.policy),
          // N42: 부분 실패도 저장한다. 자외선과 관측 시각은 실제 값이므로 통째로
          // 버리면 진단과 환경의 연결이 아예 끊긴다. 대신 무엇을 못 받았는지
          // 남겨 화면이 "값 없음"과 "수집 실패"를 구별할 수 있게 한다.
          uvCollectionFailed: c.uv.failed,
          airCollectionFailed: c.air.failed,
          nowcastCollectionFailed: c.nowcast.failed,
          source,
        },
      });
    });
  }
}

/** Date를 분 단위로 절삭(초/밀리초 0). */
function truncateToMinute(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
    ),
  );
}

/** 캐시에 저장되는 페이로드. */
interface CachedWeatherPayload {
  dto: WeatherSnapshotDto;
  cachedAt: string;
}
