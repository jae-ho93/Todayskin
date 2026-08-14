// R28: 이 파일의 인터페이스들은 백엔드 DTO를 손으로 옮겨 적은 것이다. 계약의 정본은
// `api.generated.ts`(백엔드 OpenAPI 스펙에서 자동 생성)이며, CI의 api-contract-drift
// 잡이 둘 중 생성물 쪽이 최신인지 검사한다. 백엔드 DTO를 바꿨다면
// `npm run openapi:export --prefix backend && npm run openapi:types`를 돌리고,
// 여기 수기 타입도 함께 맞춘다. 신규 타입은 가급적 생성 타입에서 가져다 쓴다.

import type { components } from './api.generated';

// 서비스 제안서 7.1 근거 등급 체계와 1:1 대응
export type EvidenceGrade = 'A' | 'B' | 'C';

/**
 * 지표별 등급 — 서버 정책(`weather-status.policy.ts`)이 판정한 값.
 *
 * N40/F64: 자외선과 대기질은 등급 체계가 다르다. 하나로 합쳐 쓰던 때는 자외선지수 9가
 * "나쁨"으로 표기됐다(기상청 기준으로는 "매우높음"). 타입을 갈라 두면 라벨 맵이
 * `Record<...>`로 선언돼 있어 등급이 늘 때 컴파일이 실패한다.
 *
 * 리터럴을 손으로 적지 않고 생성 타입에서 뽑는다. 손으로 적은 유니온은 서버가 등급을
 * 늘려도 조용히 어긋나며, 실제로 이번에 그렇게 어긋났다(드리프트 검사도 못 잡았다).
 */
type WeatherSnapshotSchema =
  NonNullable<components['schemas']['WeatherSnapshotDto']>;

/** 대기질 4단계 — 좋음 · 보통 · 나쁨 · 매우나쁨 */
export type AirStatus = NonNullable<WeatherSnapshotSchema['ozoneStatus']>;

/** 자외선 5단계 — 낮음 · 보통 · 높음 · 매우높음 · 위험 */
export type UvLevel = NonNullable<WeatherSnapshotSchema['uvStatus']>;

export interface WeatherSnapshot {
  observedAt: string; // ISO timestamp
  regionName: string; // 시/도 (예: "서울특별시")
  /** F56: 시/군/구 (예: "해운대구"). 없으면 null/undefined. */
  districtName?: string | null;
  // F41: 데이터 출처 — LIVE(실시간 조회) | CACHED(Redis 캐시) | UNAVAILABLE(측정 불가)
  source?: 'LIVE' | 'CACHED' | 'UNAVAILABLE' | null;
  /**
   * N42/F70: 값이 비어 있는 이유. true면 "측정값 없음"이 아니라 "수집 실패"다.
   * 둘을 구별하지 않으면 화면이 똑같이 `-`로 그려서, 사용자는 일시적 장애인지
   * 원래 값이 없었는지 알 수 없다.
   */
  uvCollectionFailed?: boolean;
  airCollectionFailed?: boolean;
  // 각 지표는 실제 정부 API(기상청/에어코리아) 호출이 실패하면 null이다 — 목업으로 채우지 않고
  // 화면에서 "측정 불가"로 명시적으로 보여준다. 오래된 응답/캐시와의 호환을 위해 undefined도 허용한다.
  uvIndex?: number | null; // 자외선지수
  uvStatus?: UvLevel | null;
  uvIndexPeak?: number | null; // 오늘 남은 시간대 중 예상 최댓값
  uvStatusPeak?: UvLevel | null;
  uvIndexPeakHour?: number | null; // 그 최댓값이 나오는 시각(0~23시)
  ozonePpm?: number | null; // 오존 농도
  ozoneStatus?: AirStatus | null;
  pm25?: number | null; // 초미세먼지 (㎍/㎥)
  pm25Status?: AirStatus | null;
  pm10?: number | null; // 미세먼지 (㎍/㎥)
  pm10Status?: AirStatus | null;
  caiValue?: number | null; // 통합대기환경지수(CAI)
  caiStatus?: AirStatus | null;
  no2Value?: number | null;
  so2Value?: number | null;
  coValue?: number | null;
  /** N53: 기온(°C)·습도(%) — 기상청 초단기실황. 수집 실패 구분은 nowcastCollectionFailed. */
  temperature?: number | null;
  humidity?: number | null;
  nowcastCollectionFailed?: boolean;
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

// 5클래스(건선/아토피/주사/지루/정상) 질환 분류. confidence: 0-1.
export interface DiseaseClassification {
  label: string;
  confidence: number;
}

export interface SkinScoreSnapshot {
  id: string;
  capturedAt: string; // ISO timestamp
  overallScore: number; // 0-100 종합 점수
  thumbnailUri?: string;
  parts: SkinPartMetric[];
  // 신규(검증 단계): YOLO 여드름 구역 리포트(텍스트) + 5클래스 질환 분류.
  // 둘 다 없을 수 있다 -- 없으면 UI에서 해당 패널을 숨긴다.
  acneReport?: string | null;
  diseaseClassification?: DiseaseClassification | null;
}

export type RecommendationTiming = '외출 후' | '자기 전' | '언제든';

/**
 * N45: 추천이 실제로 참조한 문서. 서버 레지스트리에 등록된 것만 내려온다.
 *
 * 빈 배열은 "출처를 못 찾았다"가 아니라 "인용한 문헌이 없다"는 뜻이다. AI가 생성한
 * 문장(B)과 개인 데이터 관찰(C)이 여기 해당하고, 화면은 그 둘을 인용처럼 보이게
 * 하면 안 된다.
 */
export type EvidenceSource = NonNullable<components['schemas']['EvidenceSourceDto']>;

export interface Recommendation {
  id: string;
  title: string; // 예: "오늘은 이중 세안을 권장해요"
  grade: EvidenceGrade;
  sourceLabel: string; // sources가 비었을 때 쓰는 등급 표기
  sources: EvidenceSource[];
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
  purchaseUrl?: string; // F0: 제품 구매 링크 (FE가 Linking.openURL 할 주소)
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

export type OtpPurpose = 'signup' | 'login' | 'social_link'; // F0: social_link 추가 (N33)

export interface OtpSendResponse {
  code: string;
  recipientNumber: string;
  message: string;
}

export interface SignupRequest {
  phoneNumber: string;
  name: string;
  birthDate: string; // "YYYY-MM-DD"
  gender?: Gender; // 선택 입력. 추후 피부 측정/추천 모델의 조건 변수로 활용 예정
}

export interface User {
  id: number;
  phoneNumber: string | null;
  name: string;
  birthDate: string | null; // "YYYY-MM-DD"; 소셜 가입 직후에는 null
  gender?: Gender;
  createdAt: string;
  accessToken: string;
  // N18: refresh 토큰 회전 (NestJS /auth/refresh 응답). 로그인/가입 응답에 포함된다.
  refreshToken?: string;
  // access token 만료(초) — 백엔드 기본 15m(900s).
  expiresIn?: number;
}

export type SocialProvider = 'kakao' | 'google' | 'apple';

export interface SocialLoginResponse extends User {
  isNewUser: boolean;
}

// ── 동의(consent) ──────────────────────────────

export type ConsentPurpose =
  | 'diagnosis_image_processing'
  | 'diagnosis_image_storage'
  | 'ai_recommendation_data_transfer';

export interface ConsentPurposeInfo {
  purpose: ConsentPurpose;
  currentVersion: string;
  required: boolean; // true면 이 동의 없이는 해당 기능 진입이 막힘
  title: string;
  description: string;
  withdrawalPolicy: 'keep_results' | 'delete_images';
}

// GET /consents 응답 — 내 동의 상태 (N19 설정 화면 철회 UI용)
export interface ConsentRecord {
  purpose: ConsentPurpose;
  agreed: boolean;
  version: string;
  source?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** 현재 registry version과 일치하는 활성 동의인지 */
  active: boolean;
}

// GET/PUT /notifications/preferences 응답 (N19 설정 화면 알림 스위치 연동)
export interface NotificationPreferences {
  userId: number;
  pushEnabled: boolean;
  uvAlertEnabled: boolean;
  dustAlertEnabled: boolean;
  morningReminder: boolean;
  pushDeliveryAvailable?: boolean; // N34: 푸시 실제 발송 가능 여부 (false면 토글 비활성)
  updatedAt?: string;
}

// ── 캘린더 히스토리 (N8) ──────────────────────────
// GET /diagnosis/history/:date 응답 계약.
// 날씨·진단 분석·추천이 항상 오고, image/landmarks는 저장 동의 + 데이터 존재 시에만 채워진다.

export interface CalendarWeather {
  observedAt: string;
  regionName: string;
  /** F56: 시/군/구 (예: "해운대구"). 없으면 null/undefined. */
  districtName?: string | null;
  source: string; // LIVE | CACHED | UNAVAILABLE
  /** N42/F70: 값이 비어 있는 이유가 "수집 실패"인지. */
  uvCollectionFailed?: boolean;
  airCollectionFailed?: boolean;
  uvIndex?: number | null;
  uvStatus?: UvLevel | null;
  uvIndexPeak?: number | null;
  uvStatusPeak?: UvLevel | null;
  uvIndexPeakHour?: number | null;
  ozonePpm?: number | null;
  ozoneStatus?: AirStatus | null;
  // N55: (지역, 이 날의 KST 달력일) 전체 수집분 중 최댓값 — uvIndexPeak와 같은 개념.
  ozonePeak?: number | null;
  ozoneStatusPeak?: AirStatus | null;
  pm25?: number | null;
  pm25Status?: AirStatus | null;
  pm25Peak?: number | null;
  pm25StatusPeak?: AirStatus | null;
  pm10?: number | null;
  pm10Status?: AirStatus | null;
  pm10Peak?: number | null;
  pm10StatusPeak?: AirStatus | null;
  caiValue?: number | null;
  caiStatus?: AirStatus | null;
  no2Value?: number | null;
  so2Value?: number | null;
  coValue?: number | null;
  /** N53: 기온(°C)·습도(%) — 기상청 초단기실황. */
  temperature?: number | null;
  humidity?: number | null;
  nowcastCollectionFailed?: boolean;
}

export interface CalendarProduct {
  id: string;
  name: string;
  brand: string;
  imageUri?: string | null;
  category: string;
  purchaseUrl?: string | null; // F0 추가
  reason?: string | null;
  timing?: string | null;
}

export interface CalendarRecommendation {
  id: string;
  title: string;
  grade: EvidenceGrade;
  sourceLabel: string;
  explanation: string;
  observationalNote?: string | null;
  ingredientTags: string[];
  timing?: string | null;
  products: CalendarProduct[];
}

export interface CalendarImage {
  url: string; // presigned URL
  contentType: string;
  expiresAt: string; // ISO8601 — 만료 시각
}

export interface Landmarks {
  version: string;
  points: number[][]; // 정규화 좌표 [[x, y], ...] (0~1)
}

export interface CalendarDiagnosis {
  id: string;
  capturedAt: string;
  overallScore: number;
  status: string;
  modelVersion?: string | null;
  parts: SkinPartMetric[];
  weather: CalendarWeather | null;
  /** 촬영 전 "외출하셨나요?" 응답. weather가 null인 이유(외출 안 함 vs 수집 실패)를 구분한다. */
  wentOutside: boolean;
  recommendations: CalendarRecommendation[];
  /** 저장 동의 + 이미지 존재 시에만 채워짐. 미동의면 null. */
  image: CalendarImage | null;
  /** 저장 동의 + 랜드마크 존재 시에만 채워짐. 미동의면 null. */
  landmarks: Landmarks | null;
  // 신규(검증 단계): YOLO 여드름 구역 리포트(텍스트) + 5클래스 질환 분류.
  // 둘 다 없을 수 있다 -- 없으면 UI에서 해당 섹션을 숨긴다.
  acneReport?: string | null;
  diseaseClassification?: DiseaseClassification | null;
}

export interface CalendarDayHistory {
  date: string; // Asia/Seoul YYYY-MM-DD
  diagnoses: CalendarDiagnosis[];
}

export interface ScoreSeriesPoint {
  date: string;
  diagnosisId: string;
  capturedAt: string;
  overallScore: number;
}

export interface ScoreSeries {
  from: string;
  to: string;
  points: ScoreSeriesPoint[];
}

// ── 개인 패턴 분석 (T10) ──────────────────────────

export type PatternStatus = 'LOCKED' | 'READY';

export type CorrelationDirection = 'positive' | 'negative' | 'neutral';

export type CorrelationStrength = 'strong' | 'moderate' | 'weak' | 'negligible';

export interface PatternCorrelation {
  skinMetric: string;
  part?: FacePart | null;
  envMetric: string;
  r: number; // -1 ~ 1
  direction: CorrelationDirection;
  strength: CorrelationStrength;
  sampleSize: number;
  observationalNote?: string;
}

export interface PatternSummary {
  status: PatternStatus;
  collectedDays: number;
  requiredDays: number;
  lockedMessage?: string;
  observationalDisclaimer?: string;
  correlations: PatternCorrelation[];
  recommendationIds: string[];
}

// ── 비동기 job 모델 (N4 BullMQ, F0 추가) ────────────────────────

export type JobStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface Job<T = unknown> {
  id: string;
  status: JobStatus;
  type: string; // 'RECOMMENDATION_GENERATE' | 'WEATHER_PRODUCTS_GENERATE' | ...
  result?: T | null; // COMPLETED일 때만 채워짐 (Recommendation[] | Product[] 등)
  error?: string | null; // FAILED일 때만 채워짐
  createdAt: string; // ISO timestamp
  completedAt?: string; // ISO timestamp (COMPLETED/FAILED일 때만)
}

// ── Fast path 응답 구조 (F0/F1/F6 추가) ────────────────────────

export interface RecommendationsFastResponse {
  source: 'CACHED' | 'FALLBACK' | 'LIVE';
  jobId?: string; // source가 CACHED/FALLBACK일 때 polling 대상 jobId
  generatedAt?: string; // 메타: stale 여부 판단용 ISO timestamp
  recommendations: Recommendation[];
}

export interface WeatherProductsFastResponse {
  source: 'CACHED' | 'FALLBACK' | 'LIVE';
  jobId?: string;
  generatedAt?: string;
  items: Product[];
}

// ── 케어 루틴+제품 (OpenAI Responses API + web_search) ──────────────

export type CareType = 'weather' | 'skin' | 'combined' | 'morning';

/**
 * 근거 출처 — 기존 추천의 EvidenceSource(사람이 검증한 정적 레지스트리)와 달리
 * web_search로 실시간 확인된 것. sourceType이 '없음'이면(=null) 근거 없음.
 */
export interface CareEvidence {
  sourceName: string | null;
  sourceUrl: string | null;
  sourceType: 'WHO' | 'FDA' | '식약처' | 'AAD' | 'PubMed' | '없음';
}

export interface CareRoutineStep {
  phase: string;
  step: string;
  ingredient: string | null;
  amount: string | null;
  reason: string;
  /** 카드를 펼치면 보여주는 긴 팁(뷰티 유튜버 톤 — 발라주는 요령, 흔한 실수, 효과 시점 등). */
  detail?: string | null;
  evidence?: CareEvidence | null;
}

export type CareProductCategory =
  | '클렌저'
  | '토너'
  | '에센스/세럼/앰플'
  | '로션'
  | '크림'
  | '선크림'
  | '마스크팩'
  | '기타';

export interface CareProduct {
  name: string;
  /** 서버가 실존 여부 검증에만 쓰는 URL — 화면은 특정 판매처로 안 보내고 제품명으로 검색한다. */
  url: string;
  reason: string;
  category: CareProductCategory;
  evidence?: CareEvidence | null;
}

export interface CarePlan {
  careType: CareType;
  routine: CareRoutineStep[];
  products: CareProduct[];
  medicalDisclaimer?: string | null;
}

export interface CarePlanFastResponse {
  source: 'CACHED' | 'FALLBACK' | 'LIVE';
  jobId?: string;
  generatedAt?: string;
  plan: CarePlan;
}
