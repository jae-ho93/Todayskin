import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { LINKS, PRODUCTS, TEMPLATES } from './seed-data';

/**
 * prisma/seed.ts — 전역 추천 템플릿(A 등급 고정 문구)과 실제 화장품 카탈로그를 upsert로 채운다.
 * 데이터는 `seed-data.ts`(실제품 큐레이션, N27)를 단일 소스로 사용한다.
 * 유저별 개인 데이터(user_id/diagnosis_id)는 여기서 만들지 않는다.
 * 반복 실행에도 중복을 만들지 않기 위해 upsert를 사용한다.
 */

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

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

  console.log(`Seeding product catalog (${PRODUCTS.length} real products)...`);
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        brand: p.brand,
        imageUri: p.imageUri,
        purchaseUrl: p.purchaseUrl,
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
        purchaseUrl: p.purchaseUrl,
        matchedGrade: p.matchedGrade,
        matchedIngredients: p.matchedIngredients,
        category: p.category,
        reason: p.reason,
        timing: p.timing,
      },
    });
  }

  console.log('Seeding recommendation-product links...');
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
