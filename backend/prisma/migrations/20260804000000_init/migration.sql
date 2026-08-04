-- Todayskin 초기 마이그레이션 (T2)
-- PostgreSQL 기준. Prisma 7에서 schema.prisma + prisma.config.ts로 관리.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "DiagnosisStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FacePart" AS ENUM ('forehead', 'glabella', 'eyeArea', 'cheek', 'lips', 'jaw');

-- CreateEnum
CREATE TYPE "WeatherSource" AS ENUM ('LIVE', 'CACHED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AirStatus" AS ENUM ('good', 'moderate', 'bad');

-- CreateEnum
CREATE TYPE "EvidenceGrade" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('moisture', 'elasticity', 'brightening', 'barrier');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "phone_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "gender" "Gender",
    "role" "Role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "agreed" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnoses" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "thumbnail_uri" TEXT,
    "status" "DiagnosisStatus" NOT NULL DEFAULT 'PENDING',
    "model_version" TEXT,
    "weather_snapshot_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skin_metrics" (
    "id" SERIAL NOT NULL,
    "diagnosis_id" TEXT NOT NULL,
    "part" "FacePart" NOT NULL,
    "label" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "moisture" DOUBLE PRECISION,
    "elasticity" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "skin_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_snapshots" (
    "id" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "region_name" TEXT NOT NULL,
    "city_name" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "kma_area_no" TEXT,
    "airkorea_station_name" TEXT,
    "uv_index" DOUBLE PRECISION,
    "uv_status" "AirStatus",
    "uv_index_peak" DOUBLE PRECISION,
    "uv_status_peak" "AirStatus",
    "uv_index_peak_hour" INTEGER,
    "ozone_ppm" DOUBLE PRECISION,
    "ozone_status" "AirStatus",
    "pm25" DOUBLE PRECISION,
    "pm25_status" "AirStatus",
    "pm10" DOUBLE PRECISION,
    "pm10_status" "AirStatus",
    "cai_value" DOUBLE PRECISION,
    "cai_status" "AirStatus",
    "no2_value" DOUBLE PRECISION,
    "so2_value" DOUBLE PRECISION,
    "co_value" DOUBLE PRECISION,
    "source" "WeatherSource" NOT NULL DEFAULT 'LIVE',

    CONSTRAINT "weather_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "grade" "EvidenceGrade" NOT NULL,
    "source_label" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "observational_note" TEXT,
    "ingredient_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timing" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER,
    "diagnosis_id" TEXT,
    "template_id" TEXT,
    "title" TEXT NOT NULL,
    "grade" "EvidenceGrade" NOT NULL,
    "source_label" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "observational_note" TEXT,
    "ingredient_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timing" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "image_uri" TEXT,
    "matched_grade" "EvidenceGrade" NOT NULL,
    "matched_ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" "ProductCategory" NOT NULL,
    "reason" TEXT,
    "timing" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_products" (
    "id" SERIAL NOT NULL,
    "recommendation_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "push_enabled" BOOLEAN NOT NULL DEFAULT false,
    "uv_alert_enabled" BOOLEAN NOT NULL DEFAULT true,
    "dust_alert_enabled" BOOLEAN NOT NULL DEFAULT true,
    "morning_reminder" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "consent_records_user_id_idx" ON "consent_records"("user_id");

-- CreateIndex
CREATE INDEX "diagnoses_user_id_captured_at_idx" ON "diagnoses"("user_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "skin_metrics_diagnosis_id_part_key" ON "skin_metrics"("diagnosis_id", "part");

-- CreateIndex
CREATE INDEX "skin_metrics_diagnosis_id_idx" ON "skin_metrics"("diagnosis_id");

-- CreateIndex
CREATE INDEX "weather_snapshots_region_name_observed_at_idx" ON "weather_snapshots"("region_name", "observed_at");

-- CreateIndex
CREATE INDEX "recommendations_user_id_diagnosis_id_created_at_idx" ON "recommendations"("user_id", "diagnosis_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_products_recommendation_id_product_id_key" ON "recommendation_products"("recommendation_id", "product_id");

-- CreateIndex
CREATE INDEX "recommendation_products_product_id_idx" ON "recommendation_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_weather_snapshot_id_fkey" FOREIGN KEY ("weather_snapshot_id") REFERENCES "weather_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_metrics" ADD CONSTRAINT "skin_metrics_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "recommendation_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_products" ADD CONSTRAINT "recommendation_products_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_products" ADD CONSTRAINT "recommendation_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
