import { EvidenceGrade, ProductCategory } from '@prisma/client';

/**
 * prisma/seed-data.ts — 전역 추천 템플릿(A 등급 고정 문구)과 실제 화장품 카탈로그 데이터.
 *
 * N27: 허구 브랜드(Skinlab/Greenfield) 시드를 제거하고 실제 화장품 30~50개를 큐레이션했다.
 * - 모든 제품은 실제 존재하는 국내 유통 브랜드이며, `purchaseUrl`로 구매 페이지를 연다.
 * - `purchaseUrl`은 **인간 검증용 초안**이다. 리서치로 확보한 Olive Young `goodsNo`
 *   직링크는 검증 전이므로 배포 전 사람이 최종 확인해야 하고, 나머지는 Olive Young
 *   검색 URL(안정적인 엔드포인트)을 쓴다. 크롤링 없이 수작업 큐레이션이다.
 * - matchedIngredients는 `ALLOWED_INGREDIENTS`(gemini.client.ts) whitelist만 사용한다.
 *
 * seed.ts와 테스트(seed-migration e2e)가 이 파일을 단일 소스로 import한다.
 */

export type TemplateSeed = {
  id: string;
  title: string;
  grade: EvidenceGrade;
  sourceLabel: string;
  explanation: string;
  observationalNote: string | null;
  ingredientTags: string[];
  timing: string | null;
};

export type ProductSeed = {
  id: string;
  name: string;
  brand: string;
  imageUri: string | null;
  purchaseUrl: string | null;
  matchedGrade: EvidenceGrade;
  matchedIngredients: string[];
  category: ProductCategory;
  reason: string | null;
  timing: string | null;
};

export type RecommendationLinkSeed = {
  templateId: string;
  productId: string;
  displayOrder: number;
};

/** Olive Young 검색 URL — 안정적인 엔드포인트. 상품명으로 검색 페이지를 연다. */
export function oliveYoungSearchUrl(query: string): string {
  return `https://www.oliveyoung.co.kr/store/search/getSearch.do?query=${encodeURIComponent(
    query,
  )}`;
}

export const TEMPLATES: TemplateSeed[] = [
  {
    id: 'rec-1',
    title: '오늘은 자외선 차단제를 2~3시간마다 재도포해 주세요',
    grade: 'A',
    sourceLabel: '대한피부과학회 자외선 가이드라인',
    explanation:
      '오늘 자외선지수는 8(매우 높음)로 측정되었습니다. 자외선은 피부 세포 신호전달체계에 영향을 주어 광노화와 색소침착을 유발할 수 있다는 것이 공인된 피부과학 정설입니다.',
    observationalNote: null,
    ingredientTags: ['SPF50+', '징크옥사이드'],
    timing: null,
  },
];

// C 등급은 전역 seed에서 분리 — 개인 패턴 기반이므로 seed에 넣지 않는다.
// 실제 화장품 33개 큐레이션. 허구 브랜드 없음. matchedIngredients는 whitelist만 사용.
// goodsNo 직링크 10건은 웹 리서치 기반 초안(검증 필요), 나머지는 Olive Young 검색 URL.
export const PRODUCTS: ProductSeed[] = [
  // ── barrier (자외선 차단·장벽 강화) ───────────────────────────
  {
    id: 'prod-1',
    name: '그린 마일드 업 선 플러스',
    brand: '닥터지',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('닥터지 그린 마일드 업 선 플러스'),
    matchedGrade: 'A',
    matchedIngredients: ['징크옥사이드', '나이아신아마이드'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-2',
    name: '자작나무 수분 선크림',
    brand: '라운드랩',
    imageUri: null,
    purchaseUrl:
      'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000149135',
    matchedGrade: 'A',
    matchedIngredients: ['징크옥사이드'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-3',
    name: '구름 수분 선크림',
    brand: '뷰티 오브 조선',
    imageUri: null,
    purchaseUrl:
      'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000188610',
    matchedGrade: 'A',
    matchedIngredients: ['징크옥사이드', '나이아신아마이드'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-4',
    name: '히알루론산 워터 선 젤',
    brand: '이즈니어',
    imageUri: null,
    purchaseUrl:
      'https://m.oliveyoung.co.kr/m/G.do?goodsNo=A000000170877',
    matchedGrade: 'B',
    matchedIngredients: ['징크옥사이드', '히알루론산'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-5',
    name: '아토베리어 365 크림',
    brand: '아토베리어',
    imageUri: null,
    purchaseUrl:
      'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000198320',
    matchedGrade: 'A',
    matchedIngredients: ['세라마이드'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-6',
    name: '세라마이드 아토 로션',
    brand: '일리윤',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('일리윤 세라마이드 아토 로션'),
    matchedGrade: 'B',
    matchedIngredients: ['세라마이드', '시어버터'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-7',
    name: '세라마이드 아토 크림',
    brand: '일리윤',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('일리윤 세라마이드 아토 크림'),
    matchedGrade: 'A',
    matchedIngredients: ['세라마이드'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-8',
    name: '솔리드 인 세라마이드 크림',
    brand: '토리든',
    imageUri: null,
    purchaseUrl:
      'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000228346',
    matchedGrade: 'A',
    matchedIngredients: ['세라마이드'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-9',
    name: '순정 2X 배리어 인텐시브 크림',
    brand: '에뛰드',
    imageUri: null,
    purchaseUrl:
      'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000183498',
    matchedGrade: 'B',
    matchedIngredients: ['세라마이드', '판테놀'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-10',
    name: '시카플라스트 밤 B5',
    brand: '라로슈포제',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('라로슈포제 시카플라스트 밤 B5'),
    matchedGrade: 'B',
    matchedIngredients: ['판테놀'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-11',
    name: '1025 독도 클렌저',
    brand: '라운드랩',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('라운드랩 1025 독도 클렌저'),
    matchedGrade: 'B',
    matchedIngredients: ['약산성 클렌저'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-12',
    name: '순정 약산성 6.5 휩 클렌저',
    brand: '에뛰드',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('에뛰드 순정 약산성 6.5 휩 클렌저'),
    matchedGrade: 'B',
    matchedIngredients: ['약산성 클렌저'],
    category: 'barrier',
    reason: null,
    timing: null,
  },

  // ── moisture (보습) ─────────────────────────────────────────
  {
    id: 'prod-13',
    name: '다이브인 저분자 히알루론산 세럼',
    brand: '토리든',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('토리든 다이브인 히알루론산 세럼'),
    matchedGrade: 'A',
    matchedIngredients: ['히알루론산'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-14',
    name: '다이브인 저분자 히알루론산 토너',
    brand: '토리든',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('토리든 다이브인 히알루론산 토너'),
    matchedGrade: 'B',
    matchedIngredients: ['히알루론산'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-15',
    name: '1025 독도 토너',
    brand: '라운드랩',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('라운드랩 1025 독도 토너'),
    matchedGrade: 'B',
    matchedIngredients: ['히알루론산'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-16',
    name: '1025 독도 로션',
    brand: '라운드랩',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('라운드랩 1025 독도 로션'),
    matchedGrade: 'A',
    matchedIngredients: ['히알루론산', '세라마이드'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-17',
    name: '어드벤스드 스네일 96 뮤신 파워 에센스',
    brand: '코스알엑스',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('코스알엑스 스네일 96 뮤신 에센스'),
    matchedGrade: 'B',
    matchedIngredients: ['히알루론산'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-18',
    name: '원더 블랙라이스 히알루론산 토너',
    brand: '하루하루',
    imageUri: null,
    purchaseUrl:
      'https://m.oliveyoung.co.kr/m/G.do?goodsNo=A000000225919',
    matchedGrade: 'B',
    matchedIngredients: ['히알루론산'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-19',
    name: '그린티 씨드 히알루론산 세럼',
    brand: '이니스프리',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('이니스프리 그린티 씨드 세럼'),
    matchedGrade: 'B',
    matchedIngredients: ['히알루론산'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-20',
    name: '마데카소사이드 앰플',
    brand: '스킨1004',
    imageUri: null,
    purchaseUrl:
      'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000161581',
    matchedGrade: 'A',
    matchedIngredients: ['센텔라'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-21',
    name: '하트리프 77 수딩 토너',
    brand: '아누아',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('아누아 하트리프 77 수딩 토너'),
    matchedGrade: 'B',
    matchedIngredients: ['센텔라'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-22',
    name: '하트리프 77 수딩 세럼',
    brand: '아누아',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('아누아 하트리프 77 수딩 세럼'),
    matchedGrade: 'B',
    matchedIngredients: ['센텔라'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-23',
    name: '더 리얼 시카 잎 세럼',
    brand: '셀리맥스',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('셀리맥스 더 리얼 시카 잎 세럼'),
    matchedGrade: 'B',
    matchedIngredients: ['센텔라'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-24',
    name: '시칼파트 크림',
    brand: '아벤느',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('아벤느 시칼파트 크림'),
    matchedGrade: 'B',
    matchedIngredients: ['판테놀', '센텔라'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-25',
    name: '듀얼 배리어 스킨 웨어러블 크림',
    brand: '셀리맥스',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('셀리맥스 듀얼 배리어 크림'),
    matchedGrade: 'B',
    matchedIngredients: ['세라마이드'],
    category: 'moisture',
    reason: null,
    timing: null,
  },

  // ── brightening (미백) ──────────────────────────────────────
  {
    id: 'prod-26',
    name: '더 나이아신아마이드 15 세럼',
    brand: '코스알엑스',
    imageUri: null,
    purchaseUrl:
      'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000180890',
    matchedGrade: 'A',
    matchedIngredients: ['나이아신아마이드'],
    category: 'brightening',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-27',
    name: '글로우 세럼',
    brand: '뷰티 오브 조선',
    imageUri: null,
    purchaseUrl:
      'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000188711',
    matchedGrade: 'A',
    matchedIngredients: ['나이아신아마이드'],
    category: 'brightening',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-28',
    name: '더 비타 플레인징 세럼',
    brand: '셀리맥스',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('셀리맥스 더 비타 플레인징 세럼'),
    matchedGrade: 'B',
    matchedIngredients: ['나이아신아마이드'],
    category: 'brightening',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-29',
    name: '레드 블레미쉬 클리어 수딩 크림',
    brand: '닥터지',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('닥터지 레드 블레미쉬 클리어 수딩 크림'),
    matchedGrade: 'A',
    matchedIngredients: ['나이아신아마이드', '센텔라'],
    category: 'brightening',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-30',
    name: '크림스킨 리파이너',
    brand: '라네즈',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('라네즈 크림스킨 리파이너'),
    matchedGrade: 'B',
    matchedIngredients: ['나이아신아마이드'],
    category: 'brightening',
    reason: null,
    timing: null,
  },

  // ── elasticity (탄력) ───────────────────────────────────────
  {
    id: 'prod-31',
    name: '더 펩타이드 콜라겐 부스팅 크림',
    brand: '코스알엑스',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('코스알엑스 펩타이드 콜라겐 크림'),
    matchedGrade: 'B',
    matchedIngredients: ['펩타이드'],
    category: 'elasticity',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-32',
    name: '타임 레볼루션 더 퍼스트 트리트먼트 에센스',
    brand: '미샤',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('미샤 타임 레볼루션 퍼스트 트리트먼트 에센스'),
    matchedGrade: 'B',
    matchedIngredients: ['아데노신'],
    category: 'elasticity',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-33',
    name: '화이트 트러플 퍼스트 스프레이 세럼',
    brand: '달바',
    imageUri: null,
    purchaseUrl: oliveYoungSearchUrl('달바 화이트 트러플 퍼스트 스프레이 세럼'),
    matchedGrade: 'B',
    matchedIngredients: ['펩타이드', '히알루론산'],
    category: 'elasticity',
    reason: null,
    timing: null,
  },
];

// N20: 템플릿(전역 A등급)과 관련 제품을 연결한다.
// rec-1(자외선 차단) ↔ prod-1(닥터지 그린 마일드 업 선 플러스 — 징크옥사이드 매칭)
export const LINKS: RecommendationLinkSeed[] = [
  { templateId: 'rec-1', productId: 'prod-1', displayOrder: 0 },
];
