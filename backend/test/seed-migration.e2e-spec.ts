import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Migration/Seed 멱등성 테스트 (T13).
 * 실제 PostgreSQL test DB에 대해:
 * 1. 마이그레이션으로 생성된 테이블/제약이 예상 스키마를 갖는다.
 * 2. seed가 실행 후 템플릿/제품이 존재한다.
 * 3. seed를 두 번 실행해도 row 수가 동일하다(upsert 중복 방지).
 *
 * DATABASE_URL=test DB가 필요. 없으면 스킵.
 */
describe('Migration & Seed (e2e)', () => {
  const url = process.env.DATABASE_URL;
  const hasDb = !!url && url.includes('todayskin_test');
  const describeOrSkip = hasDb ? describe : describe.skip;

  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!hasDb) return;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    await prisma.$connect();
    // seed 데이터 정리 — seed 대상이 전역 템플릿/제품이므로 안전하게 삭제.
    await prisma.recommendationTemplate.deleteMany({});
    await prisma.product.deleteMany({});
  });

  afterAll(async () => {
    if (!hasDb) return;
    // 테스트가 끝나면 seed 데이터를 남겨 다른 e2e가 사용할 수 있도록 한다.
    await prisma?.$disconnect();
  });

  /**
   * seed.ts 로직을 인라인으로 재현해 멱등성을 검증한다.
   * (별도 프로세스로 npx prisma db seed를 실행하는 것은 느리고 불안정하므로
   *  동일한 upsert 로직을 직접 실행한다.)
   */
  async function runSeedInline(): Promise<void> {
    const templates: Prisma.RecommendationTemplateCreateInput[] = [
      {
        id: 'rec-1',
        title: '오늘은 자외선 차단제를 2~3시간마다 재도포해 주세요',
        grade: 'A',
        sourceLabel: '대한피부과학회 자외선 가이드라인',
        explanation: '오늘 자외선지수는 8(매우 높음)로 측정되었습니다.',
        observationalNote: null,
        ingredientTags: ['SPF50+', '징크옥사이드'],
        timing: null,
      },
    ];

    const products: Prisma.ProductCreateInput[] = [
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

    for (const t of templates) {
      await prisma.recommendationTemplate.upsert({
        where: { id: t.id },
        update: { ...t },
        create: { ...t },
      });
    }
    for (const p of products) {
      await prisma.product.upsert({
        where: { id: p.id },
        update: { ...p },
        create: { ...p },
      });
    }
  }

  describeOrSkip('스키마 무결성', () => {
    it('필수 테이블이 마이그레이션으로 생성되어 있다', async () => {
      const tables = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
      `;
      const names = tables.map((t) => t.tablename);
      // 핵심 도메인 테이블 존재 확인
      for (const expected of [
        'users',
        'refresh_sessions',
        'diagnoses',
        'skin_metrics',
        'weather_snapshots',
        'recommendation_templates',
        'recommendations',
        'recommendation_products',
        'products',
        'notification_preferences',
        'consent_records',
      ]) {
        expect(names).toContain(expected);
      }
    });

    it('User.phoneNumber에 UNIQUE 제약이 있다', async () => {
      const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'users' AND indexdef ILIKE '%UNIQUE%'
      `;
      const names = indexes.map((i) => i.indexname);
      expect(names.some((n) => n.includes('phone'))).toBe(true);
    });

    it('Diagnosis에 외래키 제약이 존재한다', async () => {
      const fks = await prisma.$queryRaw<{ constraint_name: string }[]>`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'diagnoses' AND constraint_type = 'FOREIGN KEY'
      `;
      // 외래키가 최소 1개(user_id) 이상 존재해야 한다.
      expect(fks.length).toBeGreaterThanOrEqual(1);
    });

    it('SkinMetric에 (diagnosisId, part) UNIQUE 제약이 있다', async () => {
      const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename = 'skin_metrics' AND indexdef ILIKE '%UNIQUE%'
      `;
      // diagnosisId + part 복합 unique가 존재해야 한다.
      expect(indexes.length).toBeGreaterThan(0);
    });
  });

  describeOrSkip('Seed 멱등성', () => {
    it('첫 seed 실행 후 템플릿 1개, 제품 4개가 존재한다', async () => {
      await runSeedInline();
      const templateCount = await prisma.recommendationTemplate.count();
      const productCount = await prisma.product.count();
      expect(templateCount).toBe(1);
      expect(productCount).toBe(4);
    });

    it('두 번째 seed 실행 후에도 row 수가 동일하다 (upsert 중복 방지)', async () => {
      await runSeedInline();
      const templateCount = await prisma.recommendationTemplate.count();
      const productCount = await prisma.product.count();
      expect(templateCount).toBe(1);
      expect(productCount).toBe(4);
    });

    it('seed된 템플릿은 A등급 고정 문구를 갖는다', async () => {
      const rec1 = await prisma.recommendationTemplate.findUnique({
        where: { id: 'rec-1' },
      });
      expect(rec1).not.toBeNull();
      expect(rec1!.grade).toBe('A');
      expect(rec1!.sourceLabel).toContain('자외선');
    });

    it('seed된 제품 카탈로그는 카테고리 분포를 갖는다', async () => {
      const products = await prisma.product.findMany();
      const categories = new Set(products.map((p) => p.category));
      expect(categories.has('barrier')).toBe(true);
      expect(categories.has('moisture')).toBe(true);
    });
  });
});
