
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KmaClient, UvForecast } from './clients/kma.client';
import { AirKoreaClient, AirQualityData } from './clients/airkorea.client';
import { StationClient } from './clients/station.client';
import { WeatherStatusPolicy } from './policies/weather-status.policy';
import {
  DEFAULT_REGION,
  findNearestRegion,
} from './regions/region.registry';
import { WeatherSnapshotDto } from './dto/weather-snapshot.dto';
import { WeatherSource } from '../../common/enums/weather-source.enum';

/**
 * WeatherService — 기상청 자외선 + 에어코리아 대기오염을 결합한 실시간 스냅샷.
 * 기존 FastAPI get_current_weather 로직 이식.
 *
 * lat/lon이 주어지면(위치 권한 허용) 가장 가까운 지역의 관측소·행정구역코드를 찾고,
 * 없으면(권한 거부) 환경변수 기본 지역으로 조회한다.
 *
 * 각 필드는 독립적으로 실패할 수 있다 — 키가 없거나 호출이 실패하면 그 항목만
 * null로 응답한다(목업으로 대체하지 않는다. 프론트에서 "측정 불가"로 표시).
 *
 * 영구 저장(WeatherSnapshot DB 저장, 진단 연결)은 T6에서 다룬다.
 * 여기서는 응답용 스냅샷만 반환한다.
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
    const hasCoords = lat !== undefined && lon !== undefined;

    let areaNo: string;
    let stationName: string;
    let regionName: string;
    let uv: UvForecast;

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
      uv = uvResult;
    } else {
      areaNo = this.defaultKmaAreaNo;
      stationName = this.defaultStationName;
      regionName = DEFAULT_REGION.cityName;
      uv = await this.kmaClient.fetchUvIndex(areaNo);
    }

    const air = await this.airKoreaClient.fetchAirQuality(stationName);

    return this.buildSnapshot(uv, air, regionName);
  }

  private buildSnapshot(
    uv: UvForecast,
    air: AirQualityData,
    regionName: string,
  ): WeatherSnapshotDto {
    const source = this.resolveSource(uv, air);
    const dto = new WeatherSnapshotDto();
    dto.observedAt = new Date().toISOString();
    dto.regionName = regionName;
    dto.source = source;

    dto.uvIndex = uv.current;
    dto.uvStatus = this.policy.uvStatus(uv.current);
    dto.uvIndexPeak = uv.peak;
    dto.uvStatusPeak = this.policy.uvStatus(uv.peak);
    dto.uvIndexPeakHour = uv.peakHour;

    dto.ozonePpm = air.ozone;
    dto.ozoneStatus = this.policy.ozoneStatus(air.ozone);
    dto.pm25 = air.pm25;
    dto.pm25Status = this.policy.pm25Status(air.pm25);
    dto.pm10 = air.pm10;
    dto.pm10Status = this.policy.pm10Status(air.pm10);
    dto.caiValue = air.cai;
    dto.caiStatus = this.policy.caiStatus(air.cai);
    dto.no2Value = air.no2;
    dto.so2Value = air.so2;
    dto.coValue = air.co;

    return dto;
  }

  /**
   * 출처 판단 — 모든 주요 지표가 unavailable이면 UNAVAILABLE,
   * 하나라도 값이 있으면 LIVE(현재는 실시간 수집만 하므로).
   * Redis 캐시(T12)가 도입되면 CACHED 케이스가 추가된다.
   */
  private resolveSource(uv: UvForecast, air: AirQualityData): WeatherSource {
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
}
