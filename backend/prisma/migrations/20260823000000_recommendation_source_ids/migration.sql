-- Gemini→OpenAI 마이그레이션: 사용자별 생성 추천(B등급)도 근거 출처를 인용할 수 있게 한다.
--
-- 기존에는 B등급 추천이 sources를 항상 빈 배열로 내려보냈다(recommendation.mapper.ts의
-- modelToDto 주석: "사용자별 생성 추천(B·C)은 참조 문서가 없다"). RecommendationTemplate과
-- 같은 개념의 source_ids를 Recommendation에도 추가해, LLM이 content/evidence-sources.ts
-- 레지스트리에서 골라준 id를 저장하고 화면은 그 레코드의 발행기관·연도·URL을 보여준다.
-- 레지스트리에 없는 id는 서버가 걸러낸다 — LLM이 새 출처를 만들어내지 못한다.
ALTER TABLE "recommendations"
  ADD COLUMN "source_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
