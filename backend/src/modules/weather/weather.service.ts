import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KmaClient, UvForecastWithTime } from './clients/kma.client';
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

/**
 * 영구 저장용으로 수집한 메타데이터. 응답용 DTO와 달리 지역/측정소/좌표를 포함한다.
 */
interface CollectedWeather {
  uv: UvForecastWithTime;
  air: AirQualityDataWithTime;
  regionName: string;
  kmaAreaNo: string;
  airkoreaStation: string;
  lat: number | null;
  lon: number | null;
  cityName: string | null;
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
    const collected = await this.collect(lat, lon);
    const dto = this.buildSnapshotDto(collected);
    await this.persist(collected).catch((e) => {
      // 저장 실패가 응답 자체를 막아서는 안 된다. 로깅만 하고 계속.
      this.logger.warn(`WeatherSnapshot persist failed: ${errorName(e)}`);
    });
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
  ): Promise<WeatherSnapshot | null> {
    const collected = await this.collect(lat, lon);
    return this.persist(collected);
  }

  /**
   * 외부 API 호출과 메타데이터 수집. 저장하지 않고 raw 결과만 반환한다.
   * 테스트와 persist 분리를 위해 별도 메서드로 둔다.
   */
  private async collect(lat?: number, lon?: number): Promise<CollectedWeather> {
    const hasCoords = lat !== undefined && lon !== undefined;

    let areaNo: string;
    let stationName: string;
    let regionName: string;
    let latOut: number | null = lat ?? null;
    let lonOut: number | null = lon ?? null;
    let cityName: string | null = null;
    let uv: UvForecastWithTime;

    if (hasCoords) {
      const region = findNearestRegion(lat!, lon!);
      areaNo = region.kmaAreaNo;
      // 자외선지수 조회는 근접측정소 조회 결과와 무관(areaNo만 필요)하므로
      // 순차 대기하지 않고 병렬로 실행해 두 정부 API 모두 느릴 때의 왕복 시간을 줄인다.
      const [nearest, uvResult] = await Promise.all([
        this.stationClient.fetchNearestStation(lat!, lon!),
        this.kmaClient.fetchUvIndex(areaNo),
      ]);
      stationName = nearest?.stationName ?? region.airkoreaStationName;
      regionName = nearest?.cityName ?? region.cityName;
      cityName = nearest?.cityName ?? null;
      uv = uvResult;
    } else {
      areaNo = this.defaultKmaAreaNo;
      stationName = this.defaultStationName;
      regionName = DEFAULT_REGION.cityName;
      uv = await this.kmaClient.fetchUvIndex(areaNo);
    }

    const air = await this.airKoreaClient.fetchAirQuality(stationName);

    return {
      uv,
      air,
      regionName,
      kmaAreaNo: areaNo,
      airkoreaStation: stationName,
      lat: latOut,
      lon: lonOut,
      cityName,
    };
  }

  private buildSnapshotDto(c: CollectedWeather): WeatherSnapshotDto {
    const source = this.resolveSource(c.uv, c.air);
    const dto = new WeatherSnapshotDto();
    dto.observedAt = this.resolveObservedAt(c).toISOString();
    dto.regionName = c.regionName;
    dto.source = source;

    dto.uvIndex = c.uv.current;
    dto.uvStatus = this.policy.uvStatus(c.uv.current);
    dto.uvIndexPeak = c.uv.peak;
    dto.uvStatusPeak = this.policy.uvStatus(c.uv.peak);
    dto.uvIndexPeakHour = c.uv.peakHour;

    dto.ozonePpm = c.air.ozone;
    dto.ozoneStatus = this.policy.ozoneStatus(c.air.ozone);
    dto.pm25 = c.air.pm25;
    dto.pm25Status = this.policy.pm25Status(c.air.pm25);
    dto.pm10 = c.air.pm10;
    dto.pm10Status = this.policy.pm10Status(c.air.pm10);
    dto.caiValue = c.air.cai;
    dto.caiStatus = this.policy.caiStatus(c.air.cai);
    dto.no2Value = c.air.no2;
    dto.so2Value = c.air.so2;
    dto.coValue = c.air.co;

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
    return anyUv || anyAir ? WeatherSource.LIVE : WeatherSource.UNAVAILABLE;
  }

  /**
   * 관측 시각 — UV와 대기질의 발표 시각이 다를 수 있다.
   * 두 값이 모두 있으면 더 최근(늦은) 시각을, 하나만 있으면 그것을,
   * 둘 다 없으면 현재 서버 시각을 관측 시각으로 둔다.
   * (둘 다 없는 경우는 UNAVAILABLE이지만 응답용 observedAt은 채워야 한다.)
   */
  private resolveObservedAt(c: CollectedWeather): Date {
    const uv = c.uv.observedAt;
    const air = c.air.observedAt;
    if (uv && air) return uv >= air ? uv : air;
    if (uv) return uv;
    if (air) return air;
    return new Date();
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
    const source = this.resolveSource(c.uv, c.air);
    if (source === WeatherSource.UNAVAILABLE) {
      this.logger.debug('WeatherSnapshot skipped: UNAVAILABLE');
      return null;
    }

    const observedAt = this.resolveObservedAt(c);
    const observedAtTrunc = truncateToMinute(observedAt);

    const existing = await this.prisma.weatherSnapshot.findFirst({
      where: {
        regionName: c.regionName,
        kmaAreaNo: c.kmaAreaNo,
        airkoreaStation: c.airkoreaStation,
        observedAt: observedAtTrunc,
      },
      orderBy: { collectedAt: 'desc' },
    });
    if (existing) {
      this.logger.debug(`WeatherSnapshot reused: ${existing.id}`);
      return existing;
    }

    return this.prisma.weatherSnapshot.create({
      data: {
        observedAt,
        regionName: c.regionName,
        cityName: c.cityName,
        latitude: c.lat,
        longitude: c.lon,
        kmaAreaNo: c.kmaAreaNo,
        airkoreaStation: c.airkoreaStation,
        uvIndex: c.uv.current,
        uvStatus: this.policy.uvStatus(c.uv.current) ?? undefined,
        uvIndexPeak: c.uv.peak,
        uvStatusPeak: this.policy.uvStatus(c.uv.peak) ?? undefined,
        uvIndexPeakHour: c.uv.peakHour,
        ozonePpm: c.air.ozone,
        ozoneStatus: this.policy.ozoneStatus(c.air.ozone) ?? undefined,
        pm25: c.air.pm25,
        pm25Status: this.policy.pm25Status(c.air.pm25) ?? undefined,
        pm10: c.air.pm10,
        pm10Status: this.policy.pm10Status(c.air.pm10) ?? undefined,
        caiValue: c.air.cai,
        caiStatus: this.policy.caiStatus(c.air.cai) ?? undefined,
        no2Value: c.air.no2,
        so2Value: c.air.so2,
        coValue: c.air.co,
        source,
      },
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

function errorName(e: unknown): string {
  return e instanceof Error ? e.name : String(e);
}
