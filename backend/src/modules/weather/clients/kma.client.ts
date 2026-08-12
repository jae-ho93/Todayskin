import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errorName } from '../../../common/errors/error-name.util';
import { fetchWithTimeout } from './fetch-with-timeout';

/** 기상청 생활기상지수(자외선) V5 endpoint */
const KMA_UV_ENDPOINT =
  'https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5';

/** 한국 표준시(UTC+9) */
const KST_OFFSET_MIN = 9 * 60;

export interface UvForecast {
  current: number | null;
  /** 오늘 남은 시간대 중 예상 최댓값 */
  peak: number | null;
  /** 그 최댓값이 나오는 시각(0~23시) */
  peakHour: number | null;
}

/**
 * 관측(발표) 시각. KMA 응답 item에는 발표시각 필드가 없으므로, 조회에 사용한
 * queryTime(yyyyMMddHH, KST)을 관측 시각으로 사용한다. 실패 시 null.
 */
export interface UvForecastWithTime extends UvForecast {
  observedAt: Date | null;
}

const EMPTY_FORECAST_WITH_TIME: UvForecastWithTime = {
  current: null,
  peak: null,
  peakHour: null,
  observedAt: null,
};

/** "-" / "" / null → null, 그 외 float 파싱. 실패 시 null. */
function safeFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === '-' || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * KmaClient — 기상청 생활기상지수(자외선) V5 조회.
 * 정부 API 호출 실패 시 목업값으로 채우지 않고 빈 UvForecast를 반환해
 * 상위에서 해당 지표를 측정 불가 상태로 처리한다.
 *
 * 응답에는 3시간 간격 미래 예보(h0~h75)가 전부 들어있어, 현재값과 함께
 * "오늘 남은 시간대 중 실제 최댓값"을 추가 호출 없이 같이 뽑는다.
 * 고정 시간대를 피크로 가정하면 이미 그 시간을 지났거나 실제 최고치가
 * 다른 시간대일 때 "피크가 현재보다 낮게" 나오는 모순이 생길 수 있어
 * 항상 오늘 남은 슬롯 전체를 스캔한다.
 */
@Injectable()
export class KmaClient {
  private readonly logger = new Logger(KmaClient.name);
  private readonly apiKey: string;
  private readonly timeoutMs = 8000;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = configService.get<string>('KMA_API_KEY', '');
  }

  async fetchUvIndex(areaNo: string): Promise<UvForecastWithTime> {
    if (!this.apiKey) {
      return EMPTY_FORECAST_WITH_TIME;
    }

    // 이 시각의 발표자료가 아직 없을 수 있어 3시간 전 정시로 조회
    const base = new Date(Date.now() - 3 * 3600 * 1000);
    const queryTime = formatKmaQueryTime(base);

    const params = new URLSearchParams({
      serviceKey: this.apiKey,
      numOfRows: '1',
      pageNo: '1',
      areaNo,
      time: queryTime,
      dataType: 'JSON',
    });

    try {
      const url = `${KMA_UV_ENDPOINT}?${params.toString()}`;
      const res = await fetchWithTimeout(url, this.timeoutMs);
      if (!res.ok) {
        // httpx 예외 문자열엔 serviceKey가 담긴 URL이 그대로 포함되므로
        // 절대 통째로 로깅하지 않는다. 상태 코드만 로깅.
        this.logger.warn(`KMA UV fetch failed: HTTP ${res.status}`);
        return EMPTY_FORECAST_WITH_TIME;
      }
      const data = (await res.json()) as KmaResponse;
      const item = extractFirstItem(data);
      if (!item) {
        return EMPTY_FORECAST_WITH_TIME;
      }

      // query_time을 3시간 전으로 조회했으므로 h0가 아니라
      // h3(=query_time+3시간 ≈ 지금 시점 값)를 읽어야 실제 현재 시각 예보와 맞는다
      const current = safeFloat(item.h3);

      let peak: number | null = null;
      let peakHour: number | null = null;
      for (const [offset, hour] of todayRemainingSlots(base)) {
        const value = safeFloat(item[`h${offset}`]);
        if (value !== null && (peak === null || value > peak)) {
          peak = value;
          peakHour = hour;
        }
      }

      // queryTime(yyyyMMddHH, KST)을 관측 시각으로 사용한다.
      return { current, peak, peakHour, observedAt: parseKmaTime(queryTime) };
    } catch (e) {
      // 타입/네트워크 문제는 전부 unavailable 폴백
      this.logger.warn(`KMA UV fetch failed: ${errorName(e)}`);
      return EMPTY_FORECAST_WITH_TIME;
    }
  }
}

/** KMA 응답 래퍼 타입 (실제 item 필드는 동적) */
interface KmaItem {
  [key: string]: string | undefined;
}

interface KmaResponse {
  response?: {
    body?: {
      items?: KmaItem | KmaItem[] | { item?: KmaItem | KmaItem[] };
    };
  };
}

function extractFirstItem(data: KmaResponse): KmaItem | null {
  const items = data?.response?.body?.items;
  if (!items) return null;
  if (Array.isArray(items)) {
    return items[0] ?? null;
  }
  if ('item' in items) {
    const item = (items as { item?: KmaItem | KmaItem[] }).item;
    if (Array.isArray(item)) return item[0] ?? null;
    return item ?? null;
  }
  // 단일 item 객체로 내려오는 경우
  return items as KmaItem;
}

/**
 * base 시각(3시간 격자)부터 당일 자정 전까지 남은 (h오프셋, 실제 시각 hour) 목록.
 * 응답 필드는 h0~h75(3시간 간격)까지만 있어 그 범위 안에서만 본다.
 */
function todayRemainingSlots(base: Date): Array<[number, number]> {
  const slots: Array<[number, number]> = [];
  const baseKstDay = toKst(base).getDate();
  for (let offset = 0; offset <= 75; offset += 3) {
    const slotDt = new Date(base.getTime() + offset * 3600 * 1000);
    if (toKst(slotDt).getDate() !== baseKstDay) break;
    slots.push([offset, toKst(slotDt).getHours()]);
  }
  return slots;
}

/** Date → KST 기준으로 해석한 Date (UTC 밀리초 shift) */
function toKst(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MIN * 60 * 1000);
}

/** KMA time 파라미터 포맷: yyyyMMddHH (KST 기준) */
function formatKmaQueryTime(date: Date): string {
  const kst = toKst(date);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  return `${y}${m}${d}${h}`;
}

/** KMA time 파라미터(yyyyMMddHH, KST) → UTC Date */
function parseKmaTime(yyyyMMddHH: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(yyyyMMddHH);
  if (!m) return null;
  const [, y, mo, d, h] = m;
  // KST(UTC+9) → UTC
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h) - KST_OFFSET_MIN * 60 * 1000;
  return new Date(utcMs);
}

