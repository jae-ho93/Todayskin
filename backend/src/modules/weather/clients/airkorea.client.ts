import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errorName } from '../../../common/errors/error-name.util';
import { withRetry } from '../../../common/retry/retry.util';
import { fetchWithTimeout } from './fetch-with-timeout';

/** 한국 표준시(UTC+9) */
const KST_OFFSET_MIN = 9 * 60;

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

/**
 * 관측(측정) 시각. 에어코리아 응답 item의 dataTime(예: "2026-08-04 15:00",
 * KST)을 파싱한다. 실패 시 null.
 */
export interface AirQualityDataWithTime extends AirQualityData {
  observedAt: Date | null;
  /**
   * N42: 값이 비어 있는 이유가 "수집 실패"인지 "측정값 없음"인지 구분한다.
   *
   * 예전에는 둘 다 그냥 null이라, 진단 기록에 영구 저장된 빈 값이 일시적 장애
   * 때문인지 원래 값이 없었던 건지 알 수 없었다. 화면도 똑같이 `-`로 그렸다.
   * 재시도할 가치가 있는지 판단하는 근거이기도 하다.
   */
  failed: boolean;
}

const EMPTY_VALUES = {
  ozone: null,
  pm25: null,
  pm10: null,
  cai: null,
  no2: null,
  so2: null,
  co: null,
  observedAt: null,
} as const;

/** 호출이 실패했다(타임아웃·HTTP 오류·파싱 실패). 재시도할 가치가 있다. */
const FAILED: AirQualityDataWithTime = { ...EMPTY_VALUES, failed: true };

/** 호출은 됐지만 쓸 값이 없다(키 미설정 등). 재시도해도 결과가 같다. */
const EMPTY: AirQualityDataWithTime = { ...EMPTY_VALUES, failed: false };

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
  // 8000 -> 3500: 에어코리아가 느리거나 타임아웃날 때 사용자 체감 대기가 너무 길었다
  // (측정소 조회 -> 대기질 조회 순차 실행이라 최악 16초까지 늘어남). 실패를 더 빨리
  // 인지하고 "분석 중"으로 보여주는 쪽이 오래 기다리다 실패하는 것보다 낫다.
  private readonly timeoutMs = 3500;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = configService.get<string>('AIRKOREA_API_KEY', '');
  }

  /**
   * @param retries 일시 실패 시 재시도 횟수. 기본 0 — 응답 경로는 재시도하지 않는다
   *   (외부 API가 느릴 때 모든 사용자의 지연이 배로 늘어난다). 결과를 영구 저장하는
   *   진단 경로만 켠다 — N42.
   */
  async fetchAirQuality(
    stationName: string,
    retries = 0,
  ): Promise<AirQualityDataWithTime> {
    if (!this.apiKey) {
      return EMPTY;
    }
    return withRetry(() => this.fetchOnce(stationName), {
      retries,
      shouldRetry: (result) => result.failed,
    });
  }

  private async fetchOnce(stationName: string): Promise<AirQualityDataWithTime> {
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
        return FAILED;
      }
      const data = (await res.json()) as AirKoreaResponse;
      const latest = extractFirstItem(data);
      if (!latest) {
        // 응답은 왔는데 측정 항목이 없다. 재시도해도 같은 결과라 실패로 보지 않는다.
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
        observedAt: parseAirKoreaTime(latest.dataTime),
        failed: false,
      };
    } catch (e) {
      this.logger.warn(`AirKorea air quality fetch failed: ${errorName(e)}`);
      return FAILED;
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
  dataTime?: string;
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

/**
 * 에어코리아 dataTime(예: "2026-08-04 15:00", KST) → UTC Date.
 * "YYYY-MM-DD HH:mm" 형식을 가정하고, 24시 표기("24:00")는 다음 날 00:00으로 변환.
 */
function parseAirKoreaTime(dataTime?: string): Date | null {
  if (!dataTime) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(dataTime);
  if (!m) return null;
  let [, y, mo, d, h, mi] = m;
  let day = +d;
  if (h === '24') {
    h = '00';
    day = day + 1;
  }
  // KST(UTC+9) → UTC
  const utcMs =
    Date.UTC(+y, +mo - 1, day, +h, +mi) - KST_OFFSET_MIN * 60 * 1000;
  return new Date(utcMs);
}

