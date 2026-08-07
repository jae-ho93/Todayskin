-- N22: OTP 발송 로그 테이블 — 번호별 일일 발송 한도 집계 전용.
-- otp_codes는 maxPending 프루닝/검증 소비로 row가 지워지므로 한도 카운트로
-- 부적합하다. 발송 로그는 프루닝 대상이 아니어서 하루 발송 횟수를 정확히 센다.
CREATE TABLE "otp_send_logs" (
    "id" SERIAL NOT NULL,
    "phone_number" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_send_logs_pkey" PRIMARY KEY ("id")
);

-- 일일 집계(phoneNumber + sentAt 범위)에 사용.
-- Prisma 7은 @@index를 스네이크케이스 컬럼명 기준으로 명명한다.
CREATE INDEX "otp_send_logs_phone_number_sent_at_idx" ON "otp_send_logs"("phone_number", "sent_at");
