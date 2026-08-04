import Constants from 'expo-constants';
import type {
  EvidenceGrade,
  HistoryEntry,
  Product,
  Recommendation,
  SignupRequest,
  SkinScoreSnapshot,
  User,
  WeatherSnapshot,
} from '../types';
import { mockProducts, mockRecommendations, mockWeather, mockWeatherProducts } from '../data/mock';
import { getToken } from '../lib/session';

// 로컬 개발 시 FastAPI 스텁(backend/) 을 http://localhost:8000 에서 구동
// backend가 떠 있지 않으면 목업 데이터로 자동 폴백
//
// 실기기(Expo Go)로 테스트할 때는 localhost가 폰 자신을 가리키므로 동작하지 않는다.
// 이 경우 .env 에 EXPO_PUBLIC_API_BASE_URL=http://<PC의 LAN IP>:8000 을 설정할 것 (.env.example 참고)
const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://localhost:8000';

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

async function safeFetch<T>(path: string, fallback: T, timeoutMs = 2500): Promise<T> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      // 로컬 스텁 서버가 없을 때 UI 개발이 막히지 않도록 기본은 짧은 타임아웃 사용.
      // 외부 API를 호출하는 엔드포인트(예: 날씨)는 호출부에서 더 긴 타임아웃을 넘긴다.
      signal: timeoutSignal(timeoutMs),
    });
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

// 로그인한 유저 기준 데이터 조회. 실패(네트워크 오류·미인증·404)와 "정상적으로 없음"을
// 구분해야 하는 화면(예: 아직 촬영 기록 없음)을 위해 null을 반환한다.
async function authFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: await authHeaders(),
      signal: timeoutSignal(4000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
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

// 추천 생성처럼 읽기 성격의 POST는 백엔드/네트워크 문제 시 화면이 막히지 않도록 목업으로 폴백
async function safePostJson<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
      // Gemini 호출이 걸릴 수 있어 일반 GET보다 여유 있게 타임아웃 설정
      signal: timeoutSignal(20000),
    });
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const api = {
  // 기상청/에어코리아 등 외부 정부 API를 순차 호출하다 보니 응답이 0.5~16초까지 들쭉날쭉하다
  // (백엔드 자체 타임아웃 예산이 최대 약 16초). 기본 2.5초 타임아웃으로는 정상 응답도 자주 잘려서
  // 목업으로 폴백해버리므로(특히 앱 최초 구동 시 홈 화면) 여유 있게 20초로 늘린다.
  getWeather: (coords?: { latitude: number; longitude: number }) =>
    safeFetch<WeatherSnapshot>(
      coords ? `/weather?lat=${coords.latitude}&lon=${coords.longitude}` : '/weather',
      mockWeather,
      20000,
    ),
  // 아직 한 번도 촬영하지 않았거나 로그인하지 않은 경우 null
  getSkinScore: () => authFetch<SkinScoreSnapshot>('/diagnosis/latest'),
  getHistory: async () => (await authFetch<HistoryEntry[]>('/diagnosis/history')) ?? [],
  // 촬영 3장을 서버로 전송해 진단을 생성·저장한다. 쓰기 요청이므로 실패 시 에러를 던진다.
  submitDiagnosis: async (photos: { front: string; left: string; right: string }) => {
    const formData = new FormData();
    (['front', 'left', 'right'] as const).forEach((key) => {
      formData.append(
        key,
        { uri: photos[key], name: `${key}.jpg`, type: 'image/jpeg' } as unknown as Blob,
      );
    });
    const res = await fetch(`${API_BASE_URL}/diagnosis`, {
      method: 'POST',
      headers: await authHeaders(),
      body: formData,
      signal: timeoutSignal(15000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(extractErrorMessage(data, res.status));
    return data as SkinScoreSnapshot;
  },
  getRecommendations: (grade?: EvidenceGrade) =>
    safeFetch<Recommendation[]>(
      grade ? `/recommendations?grade=${grade}` : '/recommendations',
      grade ? mockRecommendations.filter((r) => r.grade === grade) : mockRecommendations,
    ),
  getRecommendationById: (id: string) =>
    safeFetch<Recommendation>(
      `/recommendations/${id}`,
      mockRecommendations.find((r) => r.id === id) ?? mockRecommendations[0],
    ),
  // B등급(사진+날씨 매칭): Gemini에게 오늘 피부 측정값 + 날씨를 함께 전달해 추천 생성
  generateRecommendations: (skinScore: SkinScoreSnapshot, weather: WeatherSnapshot) =>
    safePostJson<Recommendation[]>(
      '/recommendations/generate',
      { skinScore, weather },
      mockRecommendations.filter((r) => r.grade === 'B'),
    ),
  getProducts: (category?: Product['category']) =>
    safeFetch<Product[]>(
      category ? `/products?category=${category}` : '/products',
      category ? mockProducts.filter((p) => p.category === category) : mockProducts,
    ),
  // 날씨 기반(A등급) 제품 추천: 오늘 날씨/대기질만으로 카테고리별 화장품을 Gemini에게 하나씩 추천받는다
  generateWeatherProducts: (weather: WeatherSnapshot) =>
    safePostJson<Product[]>('/products/weather-based', weather, mockWeatherProducts),
  signup: (payload: SignupRequest) => postJson<User>('/auth/signup', payload),
  login: (phoneNumber: string) => postJson<User>('/auth/login', { phoneNumber }),
  // 서버 토큰 무효화는 최선 노력만 하고, 실패해도 로컬 세션 정리는 항상 진행되도록 에러를 삼킨다
  logout: async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: await authHeaders(),
        signal: timeoutSignal(4000),
      });
    } catch {
      // best-effort
    }
  },
};
