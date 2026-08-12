
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import proj4 from 'proj4';
import { DEFAULT_REGION } from '../regions/region.registry';
import { errorName } from '../../../common/errors/error-name.util';
import { fetchWithTimeout } from './fetch-with-timeout';

/** 에어코리아 근접측정소 목록 endpoint ("측정소정보 조회 서비스") */
const NEARBY_STATION_ENDPOINT =
  'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList';

/**
 * EPSG:5181 — Korea 2000 / Central Belt (GRS80 중부원점).
 * proj4 기본 defs에는 포함되지 않으므로 명시적으로 등록한다.
 * 미등록 상태에서 변환을 호출하면 예외가 나며, 좌표 기반 /weather가 500으로 터진다.
 */
const EPSG_5181 =
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs';

proj4.defs('EPSG:5181', EPSG_5181);

export interface NearestStation {
  /** 대기질 실시간 조회에 쓰는 측정소명 (예: "중구") */
  stationName: string;
  /** 주소 첫 토큰에서 뽑은 시/도 표시명 (예: "서울") */
  cityName: string;
  /**
   * F56: 주소 두 번째 토큰에서 뽑은 시/군/구 표시명 (예: "해운대구").
   * addr 예: "부산 해운대구 우동 ..." → token[1] = "해운대구". 없으면 null.
   */
  districtName: string | null;
}

/**
 * StationClient — 에어코리아 근접측정소 조회.
 * GPS 좌표(WGS84) 기준 실제 최인접 측정소를 찾는다.
 *
 * 에어코리아 근접측정소 API는 위경도가 아니라 TM 좌표
 * (GRS80 중부원점, EPSG:5181)를 요구한다. pyproj 대신 proj4 사용.
 *
 * "측정소정보 조회 서비스" 활용신청이 안 돼 있거나 호출이 실패하면
 * null을 반환해 상위에서 REGIONS 근사표로 폴백하게 한다.
 */
@Injectable()
export class StationClient {
  private readonly logger = new Logger(StationClient.name);
  private readonly apiKey: string;
  private readonly timeoutMs = 8000;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = configService.get<string>('AIRKOREA_API_KEY', '');
  }

  async fetchNearestStation(
    lat: number,
    lon: number,
  ): Promise<NearestStation | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      // WGS84(lon,lat 순서) → EPSG:5181 (TM 중부원점, x=lon, y=lat)
      // 변환 실패도 폴백 대상이므로 try 안에서 처리한다.
      const [tmX, tmY] = proj4('EPSG:4326', 'EPSG:5181', [lon, lat]);

      const params = new URLSearchParams({
        serviceKey: this.apiKey,
        returnType: 'json',
        tmX: String(tmX),
        tmY: String(tmY),
        ver: '1.1',
      });

      const url = `${NEARBY_STATION_ENDPOINT}?${params.toString()}`;
      const res = await fetchWithTimeout(url, this.timeoutMs);
      if (!res.ok) {
        this.logger.warn(`AirKorea nearby station lookup failed: HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as StationResponse;
      const nearest = extractFirstItem(data);
      if (!nearest || !nearest.stationName) {
        return null;
      }
      const addr = nearest.addr ?? '';
      // addr 예: "부산 해운대구 우동 ..." — 첫 토큰 시/도 약칭, 둘째 토큰 시/군/구.
      const tokens = addr.split(/\s+/);
      const cityName = tokens[0] || DEFAULT_REGION.cityName;
      const districtName = tokens[1] || null;
      return { stationName: nearest.stationName, cityName, districtName };
    } catch (e) {
      this.logger.warn(`AirKorea nearby station lookup failed: ${errorName(e)}`);
      return null;
    }
  }
}

interface StationItem {
  stationName?: string;
  addr?: string;
}

interface StationResponse {
  response?: {
    body?: {
      items?: StationItem | StationItem[] | { item?: StationItem | StationItem[] };
    };
  };
}

function extractFirstItem(data: StationResponse): StationItem | null {
  const items = data?.response?.body?.items;
  if (!items) return null;
  if (Array.isArray(items)) {
    return items[0] ?? null;
  }
  if ('item' in items) {
    const item = (items as { item?: StationItem | StationItem[] }).item;
    if (Array.isArray(item)) return item[0] ?? null;
    return item ?? null;
  }
  return items as StationItem;
}

