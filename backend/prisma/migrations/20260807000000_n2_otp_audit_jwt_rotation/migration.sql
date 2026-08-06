-- N2: OTP 인증, 감사 로그, JWT key rotation 테이블 추가
-- 가입·새 디바이스 로그인에 OTP 필수, ADMIN 운영 API 감사 로그, JWT kid 기반 rotation 지원

-- CreateTable: OTP 코드 (발송·검증·만료·시도 횟수·재전송 제한)
CREATE TABLE "otp_codes" (
    "id" SERIAL NOT NULL,
    "phone_number" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_codes_phone_number_purpose_idx" ON "otp_codes"("phone_number", "purpose");

-- CreateTable: 감사 로그 (ADMIN 운영 API 등 보안 행위 영구 기록)
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "actor_id" INTEGER,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "result" TEXT NOT NULL DEFAULT 'success',
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey: 감사 로그 actor → users
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: JWT key rotation (kid 기반 다중 서명 키)
CREATE TABLE "jwt_key_rotations" (
    "id" SERIAL NOT NULL,
    "kid" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jwt_key_rotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jwt_key_rotations_kid_key" ON "jwt_key_rotations"("kid");
CREATE INDEX "jwt_key_rotations_purpose_active_idx" ON "jwt_key_rotations"("purpose", "active");
