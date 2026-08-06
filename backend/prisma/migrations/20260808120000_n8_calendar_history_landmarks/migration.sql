-- N8: 히스토리 캘린더 — landmarks Json + capturedAt 날짜 범위 인덱스

ALTER TABLE "diagnoses" ADD COLUMN "landmarks" JSONB;

CREATE INDEX "diagnoses_captured_at_idx" ON "diagnoses"("captured_at");
