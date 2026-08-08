-- N24: Product.purchaseUrl — 실제 구매 URL (nullable, 카탈로그 제품은 사실상 필수)
ALTER TABLE "products" ADD COLUMN "purchase_url" TEXT;
