-- N45: 추천 근거를 확인 가능한 출처 레코드로 연결한다.
--
-- 기존 source_label은 자유 문자열이라 무엇이든 주장할 수 있었다. source_ids는
-- 코드 레지스트리(content/evidence-sources.ts)의 id만 담고, 화면에는 그 레코드가
-- 가진 발행기관·연도·URL이 뜬다. source_label은 등급별 표기로 남는다.
ALTER TABLE "recommendation_templates"
  ADD COLUMN "source_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 기존 A등급 템플릿(rec-1)은 "대한피부과학회 자외선 가이드라인"이라고만 적혀 있어
-- 어느 문서인지 확인할 수 없었다. 실제로 확인한 WHO·기상청 문서로 교체한다.
UPDATE "recommendation_templates"
SET "source_ids" = ARRAY['who-uv-index-2002', 'kma-uv-index-grade']
WHERE "grade" = 'A' AND "source_ids" = ARRAY[]::TEXT[];
