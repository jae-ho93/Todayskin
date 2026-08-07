import Constants from 'expo-constants';
import type {
  CalendarDayHistory,
  ConsentPurpose,
  ConsentPurposeInfo,
  EvidenceGrade,
  HistoryEntry,
  OtpPurpose,
  Product,
  Recommendation,
  ScoreSeries,
  SignupRequest,
  SkinScoreSnapshot,
  User,
  WeatherSnapshot,
  PatternSummary,
} from '../types';
import { clearSession, getRefreshToken, getToken, updateTokens } from '../lib/session';

// 로컬 개발 시 NestJS 백엔드(backend/)를 http://localhost:3000 에서 구동
//
// 실기기(Expo Go)로 테스트할 때는 localhost가 폰 자신을 가리키므로 동작하지 않는다.
// 이 경우 .env 에 EXPO_PUBLIC_API_BASE_URL=http://<PC의 LAN IP>:3000 을 설정할 것 (.env.example 참고)
const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://localhost:3000';

// RN의 Hermes 엔진 버전에 따라 AbortSignal.timeout()이 없을 수 있어(SDK 버전별로 갈림) 직접 구현
function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 목업으로 조용히 대체하지 않는다 — 실패(네트워크 오류·타임아웃·5xx)하면 null을 반환해서
// 호출부가 "불러올 수 없어요"를 명시적으로 보여주게 한다.
async function safeFetch<T>(path: string, timeoutMs = 2500): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { signal: timeoutSignal(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type FetchResult<T> = { status: 'ok'; data: T } | { status: 'not_found' } | { status: 'error' };

// N18: refresh 토큰 회전. 여러 요청이 동시에 401을 받아도 refresh는 정확히 1회만 보낸다.
// 성공하면 새 access token으로 세션이 갱신되고, 실패하면 clearSession()이 호출돼
// 루트 레이아웃이 로그인 화면으로 안내한다.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      await clearSession();
      return false;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: timeoutSignal(8000),
      });
      if (!res.ok) {
        // refresh 토큰도 무효·만료 → 세션 정리 후 재로그인 유도.
        await clearSession();
        return false;
      }
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken?: string;
        expiresIn?: number;
      };
      await updateTokens(data.accessToken, data.refreshToken, data.expiresIn);
      return true;
    } catch {
      await clearSession();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// N18: 인증 요청 공통. 401이면 refresh 회전을 1회 시도하고 재시도한다.
// refresh 실패 시 clearSession()이 이미 호출됐으므로 호출부는 기존처럼 실패를 받는다.
//
// 401로 거부된 요청은 JwtAuthGuard 단계에서 본문 처리 전에 거절되므로,
// POST(진단 제출·동의 등)를 refresh 후 재시도해도 서버가 부분 처리하지 않는다.
// 재시도는 doFetch()를 직접 호출(재귀 아님)하므로 refresh된 토큰도 401이면
// 무한 재시도 없이 그대로 반환된다.
async function fetchWithAuth(
  path: string,
  init: {
    method?: string;
    body?: BodyInit | null;
    timeoutMs?: number;
    contentType?: string;
  } = {},
  allowRetry = true,
): Promise<Response> {
  const doFetch = async () =>
    fetch(`${API_BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.contentType ? { 'Content-Type': init.contentType } : {}),
        ...(await authHeaders()),
      },
      body: init.body,
      signal: timeoutSignal(init.timeoutMs ?? 4000),
    });

  const res = await doFetch();
  if (res.status === 401 && allowRetry) {
    if (await refreshSession()) {
      return doFetch();
    }
  }
  return res;
}

// 로그인한 유저 기준 데이터 조회. 404("정상적으로 없음")와 그 외 실패(네트워크 오류·타임아웃·5xx)를
// 구분해야 하는 화면(예: 아직 촬영 기록 없음 vs. 불러오는 데 실패함)을 위해 결과를 분리해서 반환한다.
async function authFetch<T>(path: string): Promise<FetchResult<T>> {
  try {
    const res = await fetchWithAuth(path);
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'error' };
    return { status: 'ok', data: (await res.json()) as T };
  } catch {
    return { status: 'error' };
  }
}

function extractErrorMessage(data: unknown, status: number): string {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : JSON.stringify(d)))
      .join('\n');
  }
  return `요청에 실패했습니다 (${status})`;
}

// 회원가입 등 쓰기 요청은 실패를 숨기면 안 되므로 목업 폴백 없이 에러를 그대로 던진다
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(8000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(extractErrorMessage(data, res.status));
  }
  return data as T;
}

// 읽기 성격의 POST(추천 생성 등). 실패 시 목업으로 대체하지 않고 null을 반환한다.
async function safePostJson<T>(path: string, body: unknown, timeoutMs = 20000): Promise<T | null> {
  try {
    const res = await fetchWithAuth(
      path,
      {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs,
        contentType: 'application/json',
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// 인증이 필요한 쓰기 요청(동의 등록 등). 실패를 숨기면 안 되므로 에러를 그대로 던진다.
async function authPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithAuth(path, {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: 8000,
    contentType: 'application/json',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(extractErrorMessage(data, res.status));
  return data as T;
}

export const api = {
  // 기상청/에어코리아 등 외부 정부 API를 순차 호출하다 보니 응답이 0.5~16초까지 들쭉날쭉하다
  // (백엔드 자체 타임아웃 예산이 최대 약 16초). 기본 2.5초 타임아웃으로는 정상 응답도 자주 잘려서
  // 실패로 오인하기 쉬우므로 여유 있게 20초로 늘린다.
  getWeather: (coords?: { latitude: number; longitude: number }) =>
    safeFetch<WeatherSnapshot>(
      coords ? `/weather?lat=${coords.latitude}&lon=${coords.longitude}` : '/weather',
      20000,
    ),
  // 아직 한 번도 촬영하지 않은 경우(status: 'not_found')와 조회 실패(status: 'error')를 구분해서 반환
  getSkinScore: () => authFetch<SkinScoreSnapshot>('/diagnosis/latest'),
  getHistory: async (): Promise<HistoryEntry[] | null> => {
    const result = await authFetch<HistoryEntry[]>('/diagnosis/history');
    if (result.status === 'ok') return result.data;
    if (result.status === 'not_found') return [];
    return null;
  },
  // N8: 특정 날짜(Asia/Seoul)의 통합 히스토리 — 날씨·분석·추천 + 동의 시 이미지/랜드마크.
  getHistoryByDate: async (date: string): Promise<CalendarDayHistory | null> => {
    const result = await authFetch<CalendarDayHistory>(`/diagnosis/history/${date}`);
    return result.status === 'ok' ? result.data : null;
  },
  // N8: overallScore 시계열 — 서버가 Asia/Seoul 기준으로 집계 (기본 최근 90일).
  getScoreSeries: async (opts?: { from?: string; to?: string }): Promise<ScoreSeries | null> => {
    const params = new URLSearchParams();
    if (opts?.from) params.set('from', opts.from);
    if (opts?.to) params.set('to', opts.to);
    const qs = params.toString();
    const result = await authFetch<ScoreSeries>(
      `/diagnosis/score-series${qs ? `?${qs}` : ''}`,
    );
    return result.status === 'ok' ? result.data : null;
  },
  // 정면 촬영 1장을 서버로 전송해 진단을 생성·저장한다. 쓰기 요청이므로 실패 시 에러를 던진다.
  // wentOutside=true일 때만 서버가 날씨 스냅샷을 진단에 연결한다(실내에만 있었으면 날씨를 엮지 않음).
  submitDiagnosis: async (photo: {
    front: string;
    wentOutside: boolean;
    coords?: { latitude: number; longitude: number };
  }) => {
    const formData = new FormData();
    formData.append(
      'front',
      { uri: photo.front, name: 'front.jpg', type: 'image/jpeg' } as unknown as Blob,
    );
    const params = new URLSearchParams({ wentOutside: String(photo.wentOutside) });
    if (photo.coords) {
      params.set('lat', String(photo.coords.latitude));
      params.set('lon', String(photo.coords.longitude));
    }
    // N18: 401(access 만료)이면 refresh 후 1회 재시도하도록 fetchWithAuth를 사용한다.
    // FormData는 Content-Type을 직접 지정하면 경계 문자열이 깨지므로 지정하지 않는다.
    const res = await fetchWithAuth(
      `/diagnosis?${params.toString()}`,
      { method: 'POST', body: formData, timeoutMs: 45000 },
      // 진단 추론 뒤 KMA/AirKorea 스냅샷을 연결한다. 외부 API의 최악 대기
      // 예산(각 8초)보다 짧게 끊으면 서버 저장은 성공하고 앱만 실패로 보일 수 있다.
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(extractErrorMessage(data, res.status));
    return data as SkinScoreSnapshot;
  },
  getRecommendations: (grade?: EvidenceGrade) =>
    safeFetch<Recommendation[]>(grade ? `/recommendations?grade=${grade}` : '/recommendations'),
  getRecommendationById: (id: string) =>
    authFetch<Recommendation>(`/recommendations/${id}`).then((result) =>
      result.status === 'ok' ? result.data : null,
    ),
  // B등급(사진+날씨 매칭): Gemini에게 오늘 피부 측정값 + 날씨를 함께 전달해 추천 생성
  generateRecommendations: (diagnosisId: string) =>
    safePostJson<Recommendation[]>('/recommendations/generate', { diagnosisId }),
  getProducts: (category?: Product['category']) =>
    safeFetch<Product[]>(category ? `/products?category=${category}` : '/products'),
  // 날씨 기반(A등급) 제품 추천 (N12): 클라이언트는 좌표만 보내고 서버가 오늘 날씨/대기질을
  // 직접 조회해 상황(세안 후/외출 전/외출 후)별 화장품을 Gemini에게 하나씩 추천받는다.
  // weather 본문을 보내지 않으므로 조작된 날씨로 추천을 왜곡할 수 없다.
  generateWeatherProducts: (coords?: { latitude: number; longitude: number }) =>
    safePostJson<Product[]>('/products/weather-based', {
      lat: coords?.latitude,
      lon: coords?.longitude,
    }),
  // 가입/로그인 모두 이 두 개를 먼저 통과해야 한다 — 서버가 전화번호 본인확인(OTP)을 강제한다
  sendOtp: (phoneNumber: string, purpose: OtpPurpose) =>
    postJson<{ message: string }>('/otp/send', { phoneNumber, purpose }),
  verifyOtp: (phoneNumber: string, code: string, purpose: OtpPurpose) =>
    postJson<{ message: string }>('/otp/verify', { phoneNumber, code, purpose }),
  signup: (payload: SignupRequest) => postJson<User>('/auth/signup', payload),
  login: (phoneNumber: string) => postJson<User>('/auth/login', { phoneNumber }),
  // 동의 목적/버전 registry. 인증 불필요 — 가입 전(온보딩) 화면에서도 조회 가능.
  getConsentRegistry: () => safeFetch<ConsentPurposeInfo[]>('/consents/registry'),
  // 동의/철회 upsert. 로그인 상태에서만 호출 가능 — 온보딩에서는 가입 성공 직후(토큰 발급 후)에 호출한다.
  upsertConsent: (purpose: ConsentPurpose, agreed: boolean) =>
    authPostJson<{ purpose: string; agreed: boolean }>('/consents', { purpose, agreed }),
  // 서버 토큰 무효화는 최선 노력만 하고, 실패해도 로컬 세션 정리는 항상 진행되도록 에러를 삼킨다
  logout: async () => {
    try {
      // 401이면 이미 세션이 무효 — refresh를 시도할 필요가 없다.
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: await authHeaders(),
        signal: timeoutSignal(4000),
      });
    } catch {
      // best-effort
    }
  },
  // 개인 패턴 분석 (T10). 데이터 부족 시 null이 아니라 LOCKED 상태의 응답을 반환한다.
  // authFetch를 써서 200(LOCKED/READY)과 실패(error)를 구분한다.
  getPattern: async (): Promise<PatternSummary | null> => {
    const result = await authFetch<PatternSummary>('/diagnosis/pattern');
    if (result.status === 'ok') return result.data;
    return null;
  },
};
