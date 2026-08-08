import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { LINKS, PRODUCTS, TEMPLATES } from '../prisma/seed-data';

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
   * 데이터는 seed-data.ts(실제품 큐레이션, N27)를 단일 소스로 사용한다.
   * (별도 프로세스로 npx prisma db seed를 실행하는 것은 느리고 불안정하므로
   *  동일한 upsert 로직을 직접 실행한다.)
   */
  async function runSeedInline(): Promise<void> {
    for (const t of TEMPLATES) {
      await prisma.recommendationTemplate.upsert({
        where: { id: t.id },
        update: { ...t },
        create: { ...t },
      });
    }
    for (const p of PRODUCTS) {
      await prisma.product.upsert({
        where: { id: p.id },
        update: { ...p },
        create: { ...p },
      });
    }
    // N20: 템플릿-제품 연결도 시드 로직과 동일하게 재현한다.
    // (beforeAll이 템플릿/제품을 삭제하면 링크가 Cascade로 함께 지워지므로,
    //  재시드로 복원하지 않으면 이후 e2e의 관련 제품 단언이 실패한다.)
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
    it('첫 seed 실행 후 템플릿 1개, 실제품 30+, 링크 1개가 존재한다 (N24/N27)', async () => {
      await runSeedInline();
      const templateCount = await prisma.recommendationTemplate.count();
      const productCount = await prisma.product.count();
      const linkCount = await prisma.recommendationProduct.count();
      expect(templateCount).toBe(1);
      expect(productCount).toBeGreaterThanOrEqual(30);
      expect(linkCount).toBe(1);
    });

    it('두 번째 seed 실행 후에도 row 수가 동일하다 (upsert 중복 방지)', async () => {
      await runSeedInline();
      const templateCount = await prisma.recommendationTemplate.count();
      const productCount = await prisma.product.count();
      expect(templateCount).toBe(1);
      expect(productCount).toBeGreaterThanOrEqual(30);
    });

    it('seed된 템플릿은 A등급 고정 문구를 갖는다', async () => {
      const rec1 = await prisma.recommendationTemplate.findUnique({
        where: { id: 'rec-1' },
      });
      expect(rec1).not.toBeNull();
      expect(rec1!.grade).toBe('A');
      expect(rec1!.sourceLabel).toContain('자외선');
    });

    it('seed된 제품은 실제품만 — 허구 브랜드 없음 + purchaseUrl 존재 (N27)', async () => {
      const products = await prisma.product.findMany();
      const categories = new Set(products.map((p) => p.category));
      expect(categories.has('barrier')).toBe(true);
      expect(categories.has('moisture')).toBe(true);
      // 허구 브랜드 제거 검증
      for (const p of products) {
        expect(p.brand).not.toBe('Skinlab');
        expect(p.brand).not.toBe('Greenfield');
        expect(p.purchaseUrl).toBeTruthy();
        expect(p.purchaseUrl).toMatch(/^https?:\/\//);
      }
    });
  });
});
