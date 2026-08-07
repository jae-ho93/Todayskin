-- N10: 이미지 저장소 reconciliation — 삭제 수명주기 2단계 상태.
-- 철회·탈퇴 시 S3 객체 삭제 전에 DB에 pending_delete_at을 기록하고,
-- 재시도 worker가 미완료(pendingDeleteAt != null && deletedAt == null) row를 스캔한다.
-- deletedAt은 S3 객체 물리 삭제 완료 후에만 채워진다.

-- AlterTable
ALTER TABLE "diagnosis_images" ADD COLUMN "pending_delete_at" TIMESTAMP(3);
ALTER TABLE "diagnosis_images" ADD COLUMN "delete_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "diagnosis_images" ADD COLUMN "last_delete_error" TEXT;

-- CreateIndex (재시도 worker 스캔용)
CREATE INDEX "diagnosis_images_pending_delete_at_deleted_at_idx" ON "diagnosis_images"("pending_delete_at", "deleted_at");
