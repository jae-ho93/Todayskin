-- N4: BullMQ 비동기 Job 상태 저장
-- status 계약: PENDING → COMPLETED | FAILED

CREATE TYPE "AsyncJobType" AS ENUM ('RECOMMENDATION_GENERATE', 'PATTERN_ANALYZE', 'NOTIFICATION_SEND');
CREATE TYPE "AsyncJobStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TABLE "async_jobs" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "AsyncJobType" NOT NULL,
    "status" "AsyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "queue_name" TEXT NOT NULL,
    "bull_job_id" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "dead_letter" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "async_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "async_jobs_user_id_created_at_idx" ON "async_jobs"("user_id", "created_at");
CREATE INDEX "async_jobs_status_created_at_idx" ON "async_jobs"("status", "created_at");
CREATE INDEX "async_jobs_type_status_idx" ON "async_jobs"("type", "status");

ALTER TABLE "async_jobs" ADD CONSTRAINT "async_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
