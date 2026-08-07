import { PrismaClient, EvidenceGrade, ProductCategory } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * prisma/seed.ts — 전역 추천 템플릿(A 등급 고정 문구)과 제품 카탈로그를 upsert로 채운다.
 * 유저별 개인 데이터(user_id/diagnosis_id)는 여기서 만들지 않는다.
 * 반복 실행에도 중복을 만들지 않기 위해 upsert를 사용한다.
 */

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

type TemplateSeed = {
  id: string;
  title: string;
  grade: EvidenceGrade;
  sourceLabel: string;
  explanation: string;
  observationalNote: string | null;
  ingredientTags: string[];
  timing: string | null;
};

type ProductSeed = {
  id: string;
  name: string;
  brand: string;
  imageUri: string | null;
  matchedGrade: EvidenceGrade;
  matchedIngredients: string[];
  category: ProductCategory;
  reason: string | null;
  timing: string | null;
};

// 기존 Python mock_data.py의 전역 추천 카탈로그를 기준으로 한다.
const TEMPLATES: TemplateSeed[] = [
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
// 기존 rec-2(B), rec-3(C), rec-4(B)는 사용자/진단 기반 생성 추천이므로
// seed 대신 런타임 생성 시 Recommendation 레코드로 만든다.

const PRODUCTS: ProductSeed[] = [
  {
    id: 'prod-1',
    name: '데일리 UV 디펜스 선크림',
    brand: 'Skinlab',
    imageUri: null,
    matchedGrade: 'A',
    matchedIngredients: ['징크옥사이드', '나이아신아마이드'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-2',
    name: '퓨어 클렌징 오일',
    brand: 'Skinlab',
    imageUri: null,
    matchedGrade: 'B',
    matchedIngredients: ['호호바오일'],
    category: 'barrier',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-3',
    name: '센텔라 진정 크림',
    brand: 'Greenfield',
    imageUri: null,
    matchedGrade: 'C',
    matchedIngredients: ['센텔라', '판테놀'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
  {
    id: 'prod-4',
    name: '세라마이드 리페어 밤',
    brand: 'Greenfield',
    imageUri: null,
    matchedGrade: 'B',
    matchedIngredients: ['세라마이드', '시어버터'],
    category: 'moisture',
    reason: null,
    timing: null,
  },
];

async function main(): Promise<void> {
  console.log('Seeding recommendation templates...');
  for (const t of TEMPLATES) {
    await prisma.recommendationTemplate.upsert({
      where: { id: t.id },
      update: {
        title: t.title,
        grade: t.grade,
        sourceLabel: t.sourceLabel,
        explanation: t.explanation,
        observationalNote: t.observationalNote,
        ingredientTags: t.ingredientTags,
        timing: t.timing,
      },
      create: {
        id: t.id,
        title: t.title,
        grade: t.grade,
        sourceLabel: t.sourceLabel,
        explanation: t.explanation,
        observationalNote: t.observationalNote,
        ingredientTags: t.ingredientTags,
        timing: t.timing,
      },
    });
  }

  console.log('Seeding product catalog...');
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        brand: p.brand,
        imageUri: p.imageUri,
        matchedGrade: p.matchedGrade,
        matchedIngredients: p.matchedIngredients,
        category: p.category,
        reason: p.reason,
        timing: p.timing,
      },
      create: {
        id: p.id,
        name: p.name,
        brand: p.brand,
        imageUri: p.imageUri,
        matchedGrade: p.matchedGrade,
        matchedIngredients: p.matchedIngredients,
        category: p.category,
        reason: p.reason,
        timing: p.timing,
      },
    });
  }

  console.log('Seeding recommendation-product links...');
  // N20: 템플릿(전역 A등급)과 관련 제품을 연결한다.
  // rec-1(자외선 차단) ↔ prod-1(UV 디펜스 선크림 — 징크옥사이드 매칭)
  const LINKS: {
    templateId: string;
    productId: string;
    displayOrder: number;
  }[] = [
    { templateId: 'rec-1', productId: 'prod-1', displayOrder: 0 },
  ];
  for (const l of LINKS) {
    await prisma.recommendationProduct.upsert({
      where: {
        templateId_productId: { templateId: l.templateId, productId: l.productId },
      },
      update: { displayOrder: l.displayOrder },
      create: {
        templateId: l.templateId,
        recommendationId: null,
        productId: l.productId,
        displayOrder: l.displayOrder,
      },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
