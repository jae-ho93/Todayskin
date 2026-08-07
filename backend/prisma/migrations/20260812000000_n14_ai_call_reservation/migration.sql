-- N14: 외부 AI 호출 멱등성 — 동시 재시도가 추론/Gemini 비용을 중복 발생시키지
-- 않도록 in-flight 예약 테이블. unique(scope_key)로 한 요청만 PENDING을 보유하고,
-- COMPLETED(추천: 동일 결과 재반환) / FAILED(재시도 takeover) / PENDING(만료 시 takeover)로
-- 상태가 전이된다.

-- CreateEnum
CREATE TYPE "AiCallReservationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ai_call_reservations" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "scope_key" TEXT NOT NULL,
    "status" "AiCallReservationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_call_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique — 동시 예약 경쟁의 경계)
CREATE UNIQUE INDEX "ai_call_reservations_scope_key_key" ON "ai_call_reservations"("scope_key");

-- CreateIndex (stuck PENDING 스캔/정리용)
CREATE INDEX "ai_call_reservations_status_expires_at_idx" ON "ai_call_reservations"("status", "expires_at");

-- AddForeignKey (User 탈퇴 purge 시 예약도 정리)
ALTER TABLE "ai_call_reservations" ADD CONSTRAINT "ai_call_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
