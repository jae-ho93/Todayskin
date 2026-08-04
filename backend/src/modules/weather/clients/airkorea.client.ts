
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** 에어코리아 측정소별 실시간 측정정보 endpoint */
const AIRKOREA_ENDPOINT =
  'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty';

export interface AirQualityData {
  ozone: number | null;
  pm25: number | null;
  pm10: number | null;
  cai: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
}

const EMPTY: AirQualityData = {
  ozone: null,
  pm25: null,
  pm10: null,
  cai: null,
  no2: null,
  so2: null,
  co: null,
};

function safeFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === '-' || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * AirKoreaClient — 에어코리아 측정소별 실시간 대기오염정보 조회.
 * 오존/초미세먼지 외에도 PM10·통합대기환경지수(CAI)·NO2·SO2·CO까지
 * 한 번의 호출로 전부 받아온다 (추가 API 호출 비용 없음).
 * 실패 시 빈 AirQualityData를 반환해 상위에서 측정 불가로 처리한다.
 */
@Injectable()
export class AirKoreaClient {
  private readonly logger = new Logger(AirKoreaClient.name);
  private readonly apiKey: string;
  private readonly timeoutMs = 8000;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = configService.get<string>('AIRKOREA_API_KEY', '');
  }

  async fetchAirQuality(stationName: string): Promise<AirQualityData> {
    if (!this.apiKey) {
      return EMPTY;
    }

    const params = new URLSearchParams({
      serviceKey: this.apiKey,
      returnType: 'json',
      stationName,
      dataTerm: 'DAILY',
      ver: '1.3',
      numOfRows: '1',
      pageNo: '1',
    });

    try {
      const url = `${AIRKOREA_ENDPOINT}?${params.toString()}`;
      const res = await fetchWithTimeout(url, this.timeoutMs);
      if (!res.ok) {
        this.logger.warn(`AirKorea air quality fetch failed: HTTP ${res.status}`);
        return EMPTY;
      }
      const data = (await res.json()) as AirKoreaResponse;
      const latest = extractFirstItem(data);
      if (!latest) {
        return EMPTY;
      }
      return {
        ozone: safeFloat(latest.o3Value),
        pm25: safeFloat(latest.pm25Value),
        pm10: safeFloat(latest.pm10Value),
        cai: safeFloat(latest.khaiValue),
        no2: safeFloat(latest.no2Value),
        so2: safeFloat(latest.so2Value),
        co: safeFloat(latest.coValue),
      };
    } catch (e) {
      this.logger.warn(`AirKorea air quality fetch failed: ${errorName(e)}`);
      return EMPTY;
    }
  }
}

interface AirKoreaItem {
  o3Value?: string;
  pm25Value?: string;
  pm10Value?: string;
  khaiValue?: string;
  no2Value?: string;
  so2Value?: string;
  coValue?: string;
}

interface AirKoreaResponse {
  response?: {
    body?: {
      items?: AirKoreaItem | AirKoreaItem[] | { item?: AirKoreaItem | AirKoreaItem[] };
    };
  };
}

function extractFirstItem(data: AirKoreaResponse): AirKoreaItem | null {
  const items = data?.response?.body?.items;
  if (!items) return null;
  if (Array.isArray(items)) {
    return items[0] ?? null;
  }
  if ('item' in items) {
    const item = (items as { item?: AirKoreaItem | AirKoreaItem[] }).item;
    if (Array.isArray(item)) return item[0] ?? null;
    return item ?? null;
  }
  return items as AirKoreaItem;
}

function errorName(e: unknown): string {
  return e instanceof Error ? e.name : String(e);
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
