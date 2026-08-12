-- B4 (R33·R10·R11·R21): 인덱스 보강 + job dedupe 컬럼 + refresh 회전 계열.
-- 한 마이그레이션으로 묶어 운영 적용 횟수를 줄인다.
--
-- 운영 적용 주의 (R33):
-- Prisma는 마이그레이션 파일을 트랜잭션 안에서 실행하므로 CREATE INDEX CONCURRENTLY를
-- 여기에 쓸 수 없다(트랜잭션 블록에서 금지된다). 큰 테이블에서 잠금이 부담되면
-- 배포 전에 psql로 아래 인덱스를 CONCURRENTLY로 미리 만들면 된다 —
-- 모든 CREATE INDEX에 IF NOT EXISTS를 붙였으므로 그 경우 이 마이그레이션은 no-op가 된다.
--   예) CREATE INDEX CONCURRENTLY IF NOT EXISTS "products_category_idx" ON "products"("category");

-- ── R10: AsyncJob dedupe 키 ────────────────────────────────
-- payload JSON 경로 비교(payload->'diagnosisId')는 후보 행마다 평가돼 인덱스를 타지
-- 못했다. 값을 정규 컬럼으로 승격한다. 기존 행은 NULL로 남기고 신규 행부터 채운다
-- (dedupe 창이 수 분이라 과거 행은 조회 대상이 아니다).
ALTER TABLE "async_jobs" ADD COLUMN "dedupe_key" TEXT;

CREATE INDEX IF NOT EXISTS "async_jobs_user_id_type_dedupe_key_created_at_idx"
    ON "async_jobs" ("user_id", "type", "dedupe_key", "created_at");

-- ── R21: refresh 회전 계열(familyId) ──────────────────────
-- 1) nullable로 추가 → 2) 기존 행은 자기 id로 백필(각 세션이 독립 계열) →
-- 3) NOT NULL 승격. 이 순서를 지키지 않으면 기존 행 때문에 NOT NULL 추가가 실패한다.
ALTER TABLE "refresh_sessions" ADD COLUMN "family_id" TEXT;
UPDATE "refresh_sessions" SET "family_id" = "id" WHERE "family_id" IS NULL;
ALTER TABLE "refresh_sessions" ALTER COLUMN "family_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "refresh_sessions_family_id_idx"
    ON "refresh_sessions" ("family_id");

-- ── R33 + R11: 조회 패턴·보존 스윕 인덱스 ─────────────────
CREATE INDEX IF NOT EXISTS "refresh_sessions_expires_at_idx"
    ON "refresh_sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "refresh_sessions_revoked_at_idx"
    ON "refresh_sessions" ("revoked_at");

CREATE INDEX IF NOT EXISTS "otp_codes_expires_at_idx"
    ON "otp_codes" ("expires_at");
CREATE INDEX IF NOT EXISTS "otp_send_logs_sent_at_idx"
    ON "otp_send_logs" ("sent_at");

CREATE INDEX IF NOT EXISTS "weather_snapshots_collected_at_idx"
    ON "weather_snapshots" ("collected_at");

CREATE INDEX IF NOT EXISTS "ai_call_reservations_status_updated_at_idx"
    ON "ai_call_reservations" ("status", "updated_at");

-- 카탈로그 목록: category 필터 + 커서 페이지네이션(created_at, id) 정렬.
CREATE INDEX IF NOT EXISTS "products_category_idx"
    ON "products" ("category");
CREATE INDEX IF NOT EXISTS "products_created_at_id_idx"
    ON "products" ("created_at", "id");

CREATE INDEX IF NOT EXISTS "recommendation_templates_created_at_id_idx"
    ON "recommendation_templates" ("created_at", "id");
