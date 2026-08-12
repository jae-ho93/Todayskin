-- N44: 탈퇴 사용자의 진단 결과를 완전 삭제로 전환
--
-- 구 정책은 탈퇴 시 진단을 익명화해 보존했다(user_id SetNull). 새 정책에서는
-- 존재해서는 안 되는 데이터이므로 이미 남아 있는 행을 정리한다.
--
-- 1) user_id IS NULL — 이전 purge가 남긴 주인 없는 진단. 되찾을 주체가 없다.
-- 2) 탈퇴(soft delete)한 사용자의 진단 — purge를 기다리던 행.
--
-- 부위 점수·이미지 메타는 FK Cascade로 함께 사라진다. 추천은 diagnosis_id가
-- SetNull이라 따로 지운다 — 그대로 두면 지운 진단을 설명하는 문장만 남는다.

DELETE FROM "recommendations"
WHERE "diagnosis_id" IN (
  SELECT d."id" FROM "diagnoses" d
  LEFT JOIN "users" u ON u."id" = d."user_id"
  WHERE d."user_id" IS NULL OR u."deleted_at" IS NOT NULL
);

DELETE FROM "recommendations"
WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "deleted_at" IS NOT NULL);

DELETE FROM "diagnoses"
WHERE "user_id" IS NULL
   OR "user_id" IN (SELECT "id" FROM "users" WHERE "deleted_at" IS NOT NULL);
