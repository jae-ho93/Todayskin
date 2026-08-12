import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errorName } from '../../../common/errors/error-name.util';
import { withRetry } from '../../../common/retry/retry.util';
import { fetchWithTimeout } from './fetch-with-timeout';

/** 기상청 생활기상지수(자외선) V5 endpoint */
const KMA_UV_ENDPOINT =
  'https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5';

/** N53: 기상청 단기예보 초단기실황(기온 T1H·습도 REH) endpoint. 같은 API 키를 쓴다. */
const KMA_NOWCAST_ENDPOINT =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';

/** 한국 표준시(UTC+9) */
const KST_OFFSET_MIN = 9 * 60;

export interface UvForecast {
  current: number | null;
  /**
   * 응답에 담긴 오늘 슬롯 중 최댓값. 조회 기준(base)이 3시간 전이고 응답이 3시간
   * 격자라, 오전에 지나간 시간대는 애초에 응답에 없다. 즉 "그날 24시간의 최댓값"이
   * 아니라 "3시간 전부터 자정까지 중 최댓값"이다.
   */
  peak: number | null;
  /** 그 최댓값이 나오는 KST 시각(0~23시) */
  peakHour: number | null;
}

/**
 * 관측(발표) 시각. KMA 응답 item에는 발표시각 필드가 없으므로, 조회에 사용한
 * queryTime(yyyyMMddHH, KST)을 관측 시각으로 사용한다. 실패 시 null.
 */
export interface UvForecastWithTime extends UvForecast {
  observedAt: Date | null;
  /**
   * N42: 값이 비어 있는 이유가 "수집 실패"인지 "예보값 없음"인지 구분한다.
   * 진단 경로는 결과를 영구 저장하므로 둘을 구별해야 재시도도 하고, 화면도
   * "측정 불가"와 "수집 실패"를 다르게 보여줄 수 있다.
   */
  failed: boolean;
}

const EMPTY_VALUES = {
  current: null,
  peak: null,
  peakHour: null,
  observedAt: null,
} as const;

/** 호출이 실패했다(타임아웃·HTTP 오류). 재시도할 가치가 있다. */
const FAILED_FORECAST: UvForecastWithTime = { ...EMPTY_VALUES, failed: true };

/** 호출은 됐지만 쓸 값이 없다(키 미설정 등). 재시도해도 결과가 같다. */
const EMPTY_FORECAST_WITH_TIME: UvForecastWithTime = {
  ...EMPTY_VALUES,
  failed: false,
};

/**
 * N53: 초단기실황 결과 — 기온(°C)·습도(%). UV와 같은 실패 구분 정책을 따른다.
 * 실패 시 목업으로 채우지 않고 null + failed 플래그로 상위에 알린다.
 */
export interface NowcastWithTime {
  temperature: number | null;
  humidity: number | null;
  observedAt: Date | null;
  failed: boolean;
}

const FAILED_NOWCAST: NowcastWithTime = {
  temperature: null,
  humidity: null,
  observedAt: null,
  failed: true,
};

const EMPTY_NOWCAST: NowcastWithTime = {
  temperature: null,
  humidity: null,
  observedAt: null,
  failed: false,
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

  /**
   * @param retries 일시 실패 시 재시도 횟수. 기본 0 — 응답 경로는 재시도하지 않는다.
   *   결과를 영구 저장하는 진단 경로만 켠다 — N42.
   */
  async fetchUvIndex(areaNo: string, retries = 0): Promise<UvForecastWithTime> {
    if (!this.apiKey) {
      return EMPTY_FORECAST_WITH_TIME;
    }
    return withRetry(() => this.fetchOnce(areaNo), {
      retries,
      shouldRetry: (result) => result.failed,
    });
  }

  /**
   * N53: 초단기실황(기온·습도) 조회. 좌표를 기상청 DFS 격자(nx/ny)로 변환해 호출한다.
   * @param retries UV와 동일 — 결과를 영구 저장하는 진단 경로만 켠다.
   */
  async fetchNowcast(
    lat: number,
    lon: number,
    retries = 0,
  ): Promise<NowcastWithTime> {
    if (!this.apiKey) {
      return EMPTY_NOWCAST;
    }
    return withRetry(() => this.fetchNowcastOnce(lat, lon), {
      retries,
      shouldRetry: (result) => result.failed,
    });
  }

  private async fetchNowcastOnce(
    lat: number,
    lon: number,
  ): Promise<NowcastWithTime> {
    const { nx, ny } = latLonToGrid(lat, lon);
    // 실황은 매시 40분경 정시(HH00) 자료가 발표된다. 40분 전이면 이전 시각을 조회.
    const base = nowcastBaseTime(new Date());

    const params = new URLSearchParams({
      serviceKey: this.apiKey,
      numOfRows: '10', // 실황 카테고리는 8개(T1H/REH/RN1/PTY/...) — 한 페이지에 다 온다.
      pageNo: '1',
      base_date: base.date,
      base_time: base.time,
      nx: String(nx),
      ny: String(ny),
      dataType: 'JSON',
    });

    try {
      const url = `${KMA_NOWCAST_ENDPOINT}?${params.toString()}`;
      const res = await fetchWithTimeout(url, this.timeoutMs);
      if (!res.ok) {
        // serviceKey가 담긴 URL을 통째로 로깅하지 않는다 — UV와 동일 정책.
        this.logger.warn(`KMA nowcast fetch failed: HTTP ${res.status}`);
        return FAILED_NOWCAST;
      }
      const data = (await res.json()) as KmaNowcastResponse;
      const items = extractNowcastItems(data);
      if (items.length === 0) {
        // 응답은 왔는데 실황 항목이 없다(키 권한 미신청 등). 재시도해도 같다.
        return EMPTY_NOWCAST;
      }

      const byCategory = new Map<string, number | null>();
      for (const item of items) {
        if (typeof item.category === 'string') {
          byCategory.set(item.category, safeFloat(item.obsrValue));
        }
      }

      const temperature = byCategory.get('T1H') ?? null;
      const humidity = byCategory.get('REH') ?? null;
      if (temperature === null && humidity === null) {
        return EMPTY_NOWCAST;
      }

      return {
        temperature,
        humidity,
        observedAt: parseKmaTime(`${base.date}${base.time.slice(0, 2)}`),
        failed: false,
      };
    } catch (e) {
      this.logger.warn(`KMA nowcast fetch failed: ${errorName(e)}`);
      return FAILED_NOWCAST;
    }
  }

  private async fetchOnce(areaNo: string): Promise<UvForecastWithTime> {
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
        return FAILED_FORECAST;
      }
      const data = (await res.json()) as KmaResponse;
      const item = extractFirstItem(data);
      if (!item) {
        // 응답은 왔는데 예보 항목이 없다. 재시도해도 같은 결과다.
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
      return {
        current,
        peak,
        peakHour,
        observedAt: parseKmaTime(queryTime),
        failed: false,
      };
    } catch (e) {
      // 타입/네트워크 문제는 전부 unavailable 폴백
      this.logger.warn(`KMA UV fetch failed: ${errorName(e)}`);
      return FAILED_FORECAST;
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
 * base 시각(3시간 격자)부터 당일 자정 전까지의 (h오프셋, KST 시각 hour) 목록.
 * 응답 필드는 h0~h75(3시간 간격)까지만 있어 그 범위 안에서만 본다.
 *
 * `toKst()`는 UTC 밀리초를 +9시간 민 Date를 돌려주므로 **반드시 UTC 게터로 읽어야 한다.**
 * `getHours()`/`getDate()` 같은 로컬 게터를 쓰면 실행 머신의 타임존이 한 번 더 더해진다
 * (KST 머신에서 12시가 21시로 표시되던 N39 버그). 같은 파일의 `formatKmaQueryTime`이
 * 쓰는 방식과 맞춘다. 테스트를 위해 export한다.
 */
export function todayRemainingSlots(base: Date): Array<[number, number]> {
  const slots: Array<[number, number]> = [];
  const baseKstDay = toKst(base).getUTCDate();
  for (let offset = 0; offset <= 75; offset += 3) {
    const slotDt = new Date(base.getTime() + offset * 3600 * 1000);
    if (toKst(slotDt).getUTCDate() !== baseKstDay) break;
    slots.push([offset, toKst(slotDt).getUTCHours()]);
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

// ── N53: 초단기실황 헬퍼 ─────────────────────────────────────────────

/** 초단기실황 응답 item (category/obsrValue만 사용) */
interface KmaNowcastItem {
  category?: string;
  obsrValue?: string | number;
}

interface KmaNowcastResponse {
  response?: {
    body?: {
      items?: { item?: KmaNowcastItem | KmaNowcastItem[] };
    };
  };
}

function extractNowcastItems(data: KmaNowcastResponse): KmaNowcastItem[] {
  const item = data?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

/**
 * 초단기실황 발표 시각. 정시(HH00) 자료가 매시 40분경 API에 올라오므로,
 * 40분 전이면 이전 정시를 조회해야 "자료 없음" 빈 응답을 피한다.
 * 테스트를 위해 export한다.
 */
export function nowcastBaseTime(now: Date): { date: string; time: string } {
  const kst = toKst(now);
  const base =
    kst.getUTCMinutes() < 40
      ? new Date(kst.getTime() - 3600 * 1000)
      : kst;
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  const h = String(base.getUTCHours()).padStart(2, '0');
  return { date: `${y}${m}${d}`, time: `${h}00` };
}

/**
 * 위/경도 → 기상청 DFS 격자(nx/ny). 기상청 단기예보 API 활용가이드의
 * Lambert Conformal Conic 변환 공식 그대로다. 테스트를 위해 export한다.
 */
export function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0 * (Math.PI / 180);
  const SLAT2 = 60.0 * (Math.PI / 180);
  const OLON = 126.0 * (Math.PI / 180);
  const OLAT = 38.0 * (Math.PI / 180);
  const XO = 43; // 기준점 X좌표(GRID)
  const YO = 136; // 기준점 Y좌표(GRID)

  const re = RE / GRID;
  let sn =
    Math.tan(Math.PI * 0.25 + SLAT2 * 0.5) /
    Math.tan(Math.PI * 0.25 + SLAT1 * 0.5);
  sn = Math.log(Math.cos(SLAT1) / Math.cos(SLAT2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + SLAT1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(SLAT1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + OLAT * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * (Math.PI / 180) * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * (Math.PI / 180) - OLON;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

