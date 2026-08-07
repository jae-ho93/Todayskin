-- N22: OTP 코드 평문 저장 → SHA-256(salt + code) 해시 저장.
-- 기존 평문 코드는 해시로 역산할 수 없으므로 폐기한다(개발/테스트 데이터만 존재).

-- 해시 + salt 컬럼 추가.
ALTER TABLE "otp_codes" ADD COLUMN "code_hash" TEXT;
ALTER TABLE "otp_codes" ADD COLUMN "salt" TEXT;

-- 평문 코드는 보관하지 않는다 (DB 유출 시 노출 방지).
ALTER TABLE "otp_codes" DROP COLUMN "code";

-- 새 코드는 항상 해시로 저장되도록 NOT NULL 강제.
UPDATE "otp_codes" SET "code_hash" = '', "salt" = '' WHERE "code_hash" IS NULL;
DELETE FROM "otp_codes";
ALTER TABLE "otp_codes" ALTER COLUMN "code_hash" SET NOT NULL;
ALTER TABLE "otp_codes" ALTER COLUMN "salt" SET NOT NULL;
