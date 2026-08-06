-- N6: Soft Delete + 보존 기간 + Diagnosis 익명 보존(FK SetNull)

-- User soft delete
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "purge_after" TIMESTAMP(3);
CREATE INDEX "users_deleted_at_purge_after_idx" ON "users"("deleted_at", "purge_after");

-- Diagnosis soft delete / anonymize
ALTER TABLE "diagnoses" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "diagnoses" ADD COLUMN "purge_after" TIMESTAMP(3);
ALTER TABLE "diagnoses" ADD COLUMN "anonymized_at" TIMESTAMP(3);

-- Diagnosis.userId nullable for legal anonymized retention after User purge
ALTER TABLE "diagnoses" DROP CONSTRAINT "diagnoses_user_id_fkey";
ALTER TABLE "diagnoses" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WeatherSnapshot relation: SetNull (진단 보존)
ALTER TABLE "diagnoses" DROP CONSTRAINT IF EXISTS "diagnoses_weather_snapshot_id_fkey";
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_weather_snapshot_id_fkey"
  FOREIGN KEY ("weather_snapshot_id") REFERENCES "weather_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "diagnoses_deleted_at_purge_after_idx" ON "diagnoses"("deleted_at", "purge_after");

-- Recommendation.template Restrict (명시)
ALTER TABLE "recommendations" DROP CONSTRAINT IF EXISTS "recommendations_template_id_fkey";
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "recommendation_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
