-- N3: Consent purpose/version + DiagnosisImage S3 메타데이터
-- ConsentRecord: type → purpose, revokedAt/source/updatedAt 추가, (userId, purpose) unique
-- DiagnosisImage: 동의 기반 S3 저장 위치/암호화 메타

-- AlterTable consent_records
ALTER TABLE "consent_records" RENAME COLUMN "type" TO "purpose";
ALTER TABLE "consent_records" ADD COLUMN "source" TEXT;
ALTER TABLE "consent_records" ADD COLUMN "revoked_at" TIMESTAMP(3);
ALTER TABLE "consent_records" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop duplicate purpose rows keeping the latest id per (user_id, purpose)
DELETE FROM "consent_records" a
USING "consent_records" b
WHERE a.user_id = b.user_id
  AND a.purpose = b.purpose
  AND a.id < b.id;

CREATE UNIQUE INDEX "consent_records_user_id_purpose_key" ON "consent_records"("user_id", "purpose");
CREATE INDEX "consent_records_purpose_agreed_idx" ON "consent_records"("purpose", "agreed");

-- CreateTable diagnosis_images
CREATE TABLE "diagnosis_images" (
    "id" TEXT NOT NULL,
    "diagnosis_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "s3_bucket" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" TEXT,
    "encryption" TEXT NOT NULL DEFAULT 'AES256',
    "stored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "diagnosis_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "diagnosis_images_diagnosis_id_key" ON "diagnosis_images"("diagnosis_id");
CREATE INDEX "diagnosis_images_user_id_deleted_at_idx" ON "diagnosis_images"("user_id", "deleted_at");

ALTER TABLE "diagnosis_images" ADD CONSTRAINT "diagnosis_images_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnosis_images" ADD CONSTRAINT "diagnosis_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
