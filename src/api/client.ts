import Constants from 'expo-constants';
import type {
  CalendarDayHistory,
  ConsentPurpose,
  ConsentPurposeInfo,
  ConsentRecord,
  EvidenceGrade,
  Job,
  NotificationPreferences,
  OtpPurpose,
  OtpSendResponse,
  Product,
  Recommendation,
  RecommendationsFastResponse,
  WeatherProductsFastResponse,
  ScoreSeries,
  SignupRequest,
  SocialLoginResponse,
  SocialProvider,
  SkinScoreSnapshot,
  User,
  WeatherSnapshot,
  PatternSummary,
  Gender,
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

// RN의 Hermes 엔진 버전에 따라 AbortSignal.timeout()이 없을 수 있어(SDK 버전별로 갈림)
// 없을 때만 직접 구현한다. 네이티브 구현은 타이머가 이벤트 루프를 붙잡지 않는다.
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * R14: 모든 읽기 요청의 결과 타입.
 *
 * 실패를 null로 뭉개면 화면이 "정상적으로 비어 있음"과 "불러오지 못함"을 구분하지
 * 못해서, 재시도를 안내해야 할 자리에 빈 상태를 보여주게 된다.
 */
export type FetchResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'not_found' }
  | { status: 'error' };

// N18: refresh 토큰 회전. 여러 요청이 동시에 401을 받아도 refresh는 정확히 1회만 보낸다.
// 성공하면 새 access token으로 세션이 갱신되고, 실패하면 clearSession()이 호출돼
// 루트 레이아웃이 로그인 화면으로 안내한다.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  // 성공·실패와 무관하게 in-flight 표식을 반드시 해제한다. 해제가 누락되면
  // 한 번 실패한 결과가 프로세스 수명 동안 캐시돼 이후 401이 영영 재발급되지 않는다.
  refreshInFlight = rotateRefreshToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function rotateRefreshToken(): Promise<boolean> {
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
  }
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

// 읽기(GET) 공통 경로. 404("정상적으로 없음")와 그 외 실패(네트워크 오류·타임아웃·5xx)를
// 구분해야 하는 화면(예: 아직 촬영 기록 없음 vs. 불러오는 데 실패함)을 위해 결과를 분리해서 반환한다.
//
// R14: 인증이 필요 없는 엔드포인트(`/weather`, `/products`, `/consents/registry` 등)도
// 이 경로를 쓴다. 토큰이 없으면 헤더가 그냥 빠지므로 동작은 같고, 서버가 나중에 인증을
// 요구하도록 바뀌어도 화면이 조용히 깨지지 않는다.
async function authFetch<T>(path: string, timeoutMs?: number): Promise<FetchResult<T>> {
  try {
    const res = await fetchWithAuth(path, { timeoutMs });
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

// 인증이 필요한 PUT 요청(알림 설정 부분 갱신 등). 실패를 숨기면 안 되므로 에러를 그대로 던진다.
async function authPutJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithAuth(path, {
    method: 'PUT',
    body: JSON.stringify(body),
    timeoutMs: 8000,
    contentType: 'application/json',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(extractErrorMessage(data, res.status));
  return data as T;
}

async function authPatchJson<T>(path: string, body: unknown): Promise<T> {
  // 백엔드 라우트는 PATCH(/auth/me) — PUT이 아니다. method 불일치 시 404가 난다.
  const res = await fetchWithAuth(path, {
    method: 'PATCH',
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
  // (백엔드 자체 타임아웃 예산이 최대 약 16초). 기본 타임아웃으로는 정상 응답도 자주 잘려서
  // 실패로 오인하기 쉬우므로 여유 있게 20초로 늘린다.
  getWeather: (coords?: { latitude: number; longitude: number }) =>
    authFetch<WeatherSnapshot>(
      coords ? `/weather?lat=${coords.latitude}&lon=${coords.longitude}` : '/weather',
      20000,
    ),
  // 아직 한 번도 촬영하지 않은 경우(status: 'not_found')와 조회 실패(status: 'error')를 구분해서 반환
  getSkinScore: () => authFetch<SkinScoreSnapshot>('/diagnosis/latest'),
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
  // 기존 추천 (동기 생성 — F1에서 제거 예정)
  getRecommendations: (grade?: EvidenceGrade) =>
    authFetch<Recommendation[]>(grade ? `/recommendations?grade=${grade}` : '/recommendations'),
  getRecommendationById: (id: string) =>
    authFetch<Recommendation>(`/recommendations/${id}`).then((result) =>
      result.status === 'ok' ? result.data : null,
    ),
  // ──────────────── F0 추가: 빠른 경로 (fast-path) ────────────────

  // F0/F1: 추천 빠른 경로 — CACHED|FALLBACK 즉시 + jobId로 LIVE 교체 가능
  // source: 'CACHED' → Redis SWR hit, 즉시 실제품 추천 반환
  // source: 'FALLBACK' → Redis miss, 규칙 기반 실제품 추천 즉시 반환
  // source: 'LIVE' → Gemini 완료, 완전 AI 추천 (jobId 있으면 polling으로 교체)
  generateRecommendationsFast: (diagnosisId: string) =>
    safePostJson<RecommendationsFastResponse>(
      '/recommendations/generate/fast',
      { diagnosisId },
      20000, // Gemini 추론 최대 시간 고려
    ),

  // F0/F6: 날씨 기반 제품 빠른 경로 — CACHED|FALLBACK 즉시 + jobId로 LIVE 교체 가능
  // (응답은 items 배열 래핑 — WeatherProductsFastResponse)
  getWeatherProductsFast: (coords?: { latitude: number; longitude: number }) =>
    safePostJson<WeatherProductsFastResponse>(
      '/products/weather-based',
      { lat: coords?.latitude, lon: coords?.longitude },
      20000,
    ),

  // F0: job polling 유틸 — jobId로 상태 조회 (PENDING → COMPLETED/FAILED)
  // 호출부가 interval을 제어하므로 이 함수는 1회만 호출 후 결과 확인
  pollJob: async <T = unknown>(jobId: string): Promise<Job<T> | null> => {
    const result = await authFetch<Job<T>>(`/jobs/${jobId}`);
    return result.status === 'ok' ? result.data : null;
  },

  // job 완료 대기 — SSE(`GET /jobs/:id/events`) 우선, 실패/불가 시 폴링 폴백.
  // 반환: COMPLETED(결과 포함)/FAILED job, 또는 완전 실패 시 null.
  // options.signal로 호출부가 취소(언마운트/재호출)할 수 있고, 취소 시 null을 반환한다.
  waitForJob: async <T = unknown>(
    jobId: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<Job<T> | null> => {
    const timeoutMs = options?.timeoutMs ?? 25_000;
    const external = options?.signal;
    const trySse = async (): Promise<Job<T> | null> => {
      if (external?.aborted) return null;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      external?.addEventListener('abort', onAbort);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = await authHeaders();
        const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/events`, {
          headers: { ...headers, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        // RN fetch 스트리밍(body.getReader)을 지원하지 않으면 즉시 폴백한다.
        if (!res.ok || typeof res.body?.getReader !== 'function') return null;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
            if (!dataLine) continue;
            try {
              const job = JSON.parse(dataLine.slice(5).trim()) as Job<T>;
              if (job.status === 'COMPLETED' || job.status === 'FAILED') return job;
            } catch {
              // 개별 이벤트 파싱 실패는 무시하고 다음 이벤트를 기다린다.
            }
          }
        }
        return null; // 스트림이 완료 이벤트 없이 종료됨 → 폴백
      } catch {
        return null; // 네트워크/타임아웃/취소 → 폴백
      } finally {
        clearTimeout(timer);
        external?.removeEventListener('abort', onAbort);
      }
    };
    const sseJob = await trySse();
    if (sseJob) return sseJob;
    if (external?.aborted) return null;
    // 폴링 폴백 — 1초 간격, 최대 20회(약 20초) 후 포기.
    for (let attempts = 0; attempts < 20; attempts += 1) {
      if (external?.aborted) return null;
      const job = await api.pollJob<T>(jobId);
      if (job?.status === 'COMPLETED' && job.result) return job;
      if (job?.status === 'FAILED') return job;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return null;
  },

  // ──────────────── F0 추가: 사용자 프로필 ────────────────

  // F0: 현재 로그인 유저 조회 (N28 설정 프로필 표시)
  getMe: async (): Promise<User | null> => {
    const result = await authFetch<User>('/auth/me');
    return result.status === 'ok' ? result.data : null;
  },

  // F0: 현재 로그인 유저 부분 갱신 — name, gender (N28 설정에서 호출)
  // phone 변경은 별도 OTP 흐름 (이번 범위 밖)
  updateMe: (patch: { name?: string; gender?: Gender }) =>
    authPatchJson<User>('/auth/me', patch),

  // ──────────────── 기존 제품·추천 ────────────────

  getProducts: (category?: Product['category']) =>
    authFetch<Product[]>(category ? `/products?category=${category}` : '/products'),

  // ──────────────── 인증 (OTP, 가입, 로그인) ────────────────

  sendOtp: (phoneNumber: string, purpose: OtpPurpose) =>
    postJson<OtpSendResponse>('/otp/send', { phoneNumber, purpose }),
  verifyOtp: (phoneNumber: string, code: string, purpose: OtpPurpose) =>
    postJson<{ message: string }>('/otp/verify', { phoneNumber, code, purpose }),
  signup: (payload: SignupRequest) => postJson<User>('/auth/signup', payload),
  login: (phoneNumber: string) => postJson<User>('/auth/login', { phoneNumber }),

  socialLogin: (provider: SocialProvider, accessToken: string) =>
    postJson<SocialLoginResponse>('/auth/social', { provider, accessToken }),
  socialLinkPhone: (phoneNumber: string, birthDate?: string) =>
    authPostJson<User>('/auth/social/link-phone', { phoneNumber, birthDate }),

  // ──────────────── 동의 & 알림 설정 ────────────────

  getConsentRegistry: () => authFetch<ConsentPurposeInfo[]>('/consents/registry'),
  upsertConsent: (purpose: ConsentPurpose, agreed: boolean) =>
    authPostJson<{ purpose: string; agreed: boolean }>('/consents', { purpose, agreed }),
  // N19: 내 동의 상태 목록 (설정 화면 철회 UI).
  getMyConsents: async (): Promise<ConsentRecord[] | null> => {
    const result = await authFetch<ConsentRecord[]>('/consents');
    return result.status === 'ok' ? result.data : null;
  },
  // N19: 알림 설정 조회 — DB에 row가 없어도 기본값을 반환한다(404 아님).
  getNotificationPreferences: async (): Promise<NotificationPreferences | null> => {
    const result = await authFetch<NotificationPreferences>('/notifications/preferences');
    return result.status === 'ok' ? result.data : null;
  },
  // N19: 알림 설정 부분 갱신 — 전달된 필드만 저장된다.
  updateNotificationPreferences: (patch: {
    pushEnabled?: boolean;
    uvAlertEnabled?: boolean;
    dustAlertEnabled?: boolean;
    morningReminder?: boolean;
  }) => authPutJson<NotificationPreferences>('/notifications/preferences', patch),
  // N19: 회원 탈퇴 (N6 soft delete — PII 스크럽, purgeAfter 후 물리 삭제).
  withdrawAccount: () =>
    authPostJson<{ deletedAt: string; purgeAfter: string }>('/auth/withdraw', {}),

  // ──────────────── 세션 & 로그아웃 ────────────────

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

  // ──────────────── 패턴 분석 ────────────────

  // 개인 패턴 분석 (T10). 데이터 부족 시 null이 아니라 LOCKED 상태의 응답을 반환한다.
  // authFetch를 써서 200(LOCKED/READY)과 실패(error)를 구분한다.
  getPattern: async (): Promise<PatternSummary | null> => {
    const result = await authFetch<PatternSummary>('/diagnosis/pattern');
    if (result.status === 'ok') return result.data;
    return null;
  },
};
