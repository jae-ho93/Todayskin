-- N20: 추천-제품 연결을 템플릿(A등급)과 생성 추천(B/C) 모두 지원하는 다형성 링크로 확장.
-- 기존 recommendation_id NOT NULL → nullable, template_id 추가, unique 제약 재구성.

-- 생성 추천 없이 템플릿만 연결하는 행을 허용한다.
ALTER TABLE "recommendation_products" ALTER COLUMN "recommendation_id" DROP NOT NULL;

-- 템플릿 연결용 컬럼.
ALTER TABLE "recommendation_products" ADD COLUMN "template_id" TEXT;

-- 기존 unique index를 제거하고 NULL-safe unique index 2개로 재구성한다.
-- (Prisma 7은 @@unique를 unique index로 생성한다. PG는 NULL끼리 중복을
--  허용하므로 recommendation_id가 NULL인 템플릿 링크 행은 [recommendation_id, product_id]
--  unique를 통과하고, 반대로 template_id NULL인 생성 추천 링크 행은
--  [template_id, product_id] unique를 통과한다. ON CONFLICT는 동일 컬럼의
--  unique index를 conflict target으로 사용할 수 있다.)
DROP INDEX "recommendation_products_recommendation_id_product_id_key";
CREATE UNIQUE INDEX "recommendation_products_recommendation_id_product_id_key" ON "recommendation_products"("recommendation_id", "product_id");
CREATE UNIQUE INDEX "recommendation_products_template_id_product_id_key" ON "recommendation_products"("template_id", "product_id");

-- 조회 경로 인덱스.
CREATE INDEX "recommendation_products_template_id_idx" ON "recommendation_products"("template_id");
CREATE INDEX "recommendation_products_recommendation_id_idx" ON "recommendation_products"("recommendation_id");

-- AddForeignKey (템플릿 삭제 시 링크도 정리)
ALTER TABLE "recommendation_products" ADD CONSTRAINT "recommendation_products_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "recommendation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 정확히 하나의 타깃(생성 추천 XOR 템플릿)만 연결되도록 강제한다.
ALTER TABLE "recommendation_products" ADD CONSTRAINT "recommendation_products_single_target_check" CHECK (
  ("recommendation_id" IS NOT NULL AND "template_id" IS NULL)
  OR
  ("recommendation_id" IS NULL AND "template_id" IS NOT NULL)
);
