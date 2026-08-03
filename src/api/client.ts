import Constants from 'expo-constants';
import type {
  EvidenceGrade,
  Recommendation,
  SignupRequest,
  SkinScoreSnapshot,
  User,
  WeatherSnapshot,
} from '../types';
import { mockRecommendations, mockSkinScore, mockWeather } from '../data/mock';

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

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      // 로컬 스텁 서버가 없을 때 UI 개발이 막히지 않도록 짧은 타임아웃 사용
      signal: timeoutSignal(2500),
    });
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
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
      headers: { 'Content-Type': 'application/json' },
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
  getWeather: (coords?: { latitude: number; longitude: number }) =>
    safeFetch<WeatherSnapshot>(
      coords ? `/weather?lat=${coords.latitude}&lon=${coords.longitude}` : '/weather',
      mockWeather,
    ),
  getSkinScore: () => safeFetch<SkinScoreSnapshot>('/diagnosis/latest', mockSkinScore),
  getRecommendations: (grade?: EvidenceGrade) =>
    safeFetch<Recommendation[]>(
      grade ? `/recommendations?grade=${grade}` : '/recommendations',
      grade ? mockRecommendations.filter((r) => r.grade === grade) : mockRecommendations,
    ),
  // B등급(사진+날씨 매칭): Gemini에게 오늘 피부 측정값 + 날씨를 함께 전달해 추천 생성
  generateRecommendations: (skinScore: SkinScoreSnapshot, weather: WeatherSnapshot) =>
    safePostJson<Recommendation[]>(
      '/recommendations/generate',
      { skinScore, weather },
      mockRecommendations.filter((r) => r.grade === 'B'),
    ),
  signup: (payload: SignupRequest) => postJson<User>('/auth/signup', payload),
  login: (phoneNumber: string) => postJson<User>('/auth/login', { phoneNumber }),
};
