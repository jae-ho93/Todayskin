// 서비스 제안서 7.1 근거 등급 체계와 1:1 대응
export type EvidenceGrade = 'A' | 'B' | 'C';

export type AirStatus = 'good' | 'moderate' | 'bad';

export interface WeatherSnapshot {
  observedAt: string; // ISO timestamp
  regionName: string; // 예: "서울 종로구"
  // 각 지표는 실제 정부 API(기상청/에어코리아) 호출이 실패하면 undefined다 — 목업으로 채우지 않고
  // 화면에서 "측정 불가"로 명시적으로 보여준다.
  uvIndex?: number; // 자외선지수
  uvStatus?: AirStatus;
  uvIndexPeak?: number; // 오늘 남은 시간대 중 예상 최댓값
  uvStatusPeak?: AirStatus;
  uvIndexPeakHour?: number; // 그 최댓값이 나오는 시각(0~23시)
  ozonePpm?: number; // 오존 농도
  ozoneStatus?: AirStatus;
  pm25?: number; // 초미세먼지 (㎍/㎥)
  pm25Status?: AirStatus;
  pm10?: number; // 미세먼지 (㎍/㎥)
  pm10Status?: AirStatus;
  caiValue?: number; // 통합대기환경지수(CAI)
  caiStatus?: AirStatus;
  no2Value?: number;
  so2Value?: number;
  coValue?: number;
}

// 11개 부위별 ResNet 앙상블 출력과 대응하는 부위 키
export type FacePart =
  | 'forehead' // 이마
  | 'glabella' // 미간
  | 'eyeArea' // 눈가
  | 'cheek' // 볼
  | 'lips' // 입술
  | 'jaw'; // 턱

export interface SkinPartMetric {
  part: FacePart;
  label: string;
  grade: string; // 예: "보통", "양호"
  moisture?: number; // 0-100
  elasticity?: number; // 0-100
  note?: string;
}

export interface SkinScoreSnapshot {
  id: string;
  capturedAt: string; // ISO timestamp
  overallScore: number; // 0-100 종합 점수
  thumbnailUri?: string;
  parts: SkinPartMetric[];
}

export type RecommendationTiming = '외출 후' | '자기 전' | '언제든';

export interface Recommendation {
  id: string;
  title: string; // 예: "오늘은 이중 세안을 권장해요"
  grade: EvidenceGrade;
  sourceLabel: string; // 예: "국내 종단연구, 2019"
  explanation: string; // "왜 이 등급인가요?" 상세 설명
  observationalNote?: string; // C등급 전용 관찰적 문구
  ingredientTags: string[];
  relatedProductIds: string[];
  timing?: RecommendationTiming; // 언제 적용하면 좋은 조언인지 (외출 후 세안법 / 자기 전 케어 등)
}

export type ProductTiming = '세안 후' | '외출 전' | '외출 후';

export interface Product {
  id: string;
  name: string;
  brand: string;
  imageUri?: string;
  matchedGrade: EvidenceGrade;
  matchedIngredients: string[];
  category: 'moisture' | 'elasticity' | 'brightening' | 'barrier';
  recommendationId?: string;
  reason?: string; // 별도 Recommendation 레코드 없이 바로 보여주는 근거 설명 (예: 날씨 기반 추천)
  timing?: ProductTiming; // 하루 중 이 제품을 쓰면 좋은 상황 (예: 날씨 기반 추천)
}

export interface HistoryEntry {
  id: string;
  capturedAt: string;
  overallScore: number;
  thumbnailUri?: string;
}

export type Gender = 'male' | 'female';

export interface SignupRequest {
  phoneNumber: string;
  name: string;
  birthDate: string; // "YYYY-MM-DD"
  gender?: Gender; // 선택 입력. 추후 피부 측정/추천 모델의 조건 변수로 활용 예정
}

export interface User {
  id: number;
  phoneNumber: string;
  name: string;
  birthDate: string; // "YYYY-MM-DD"
  gender?: Gender;
  createdAt: string;
  accessToken: string;
}
