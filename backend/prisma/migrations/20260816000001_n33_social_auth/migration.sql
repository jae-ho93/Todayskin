-- N33: 소셜 로그인 (Kakao·Google·Apple)
-- 1) 소셜 계정 ↔ Todayskin 계정 연결 테이블
-- 2) 미가입 소셜 계정은 전화번호/생년월일 없이 생성 → 온보딩에서 연결하도록 nullable 전환

CREATE TABLE "social_accounts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- 유니크: 같은 소셜 계정이 여러 Todayskin 계정을 만들지 않는다.
CREATE UNIQUE INDEX "social_accounts_provider_provider_user_id_key"
    ON "social_accounts" ("provider", "provider_user_id");

CREATE INDEX "social_accounts_user_id_idx" ON "social_accounts" ("user_id");

-- 탈퇴(purge) 시 소셜 연결도 함께 정리
ALTER TABLE "social_accounts"
    ADD CONSTRAINT "social_accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- N33: 소셜 계정은 전화번호/생년월일 없이 생성된다 (온보딩에서 연결).
-- nullable unique — 전화 가입/로그인 조회에는 영향 없음 (NULL은 여러 개 허용).
ALTER TABLE "users" ALTER COLUMN "phone_number" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "birth_date" DROP NOT NULL;
