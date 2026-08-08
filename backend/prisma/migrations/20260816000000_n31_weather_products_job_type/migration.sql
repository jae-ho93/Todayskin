-- N31/N29: 날씨 기반 제품 LIVE 생성을 위한 job type 추가 (rec-fast-path 에픽).
-- Postgres 12+는 transaction 내 enum ADD VALUE를 지원한다(같은 transaction에서
-- 새 값을 사용하지 않는 한). 여기서는 값 추가만 수행하므로 안전하다.
ALTER TYPE "AsyncJobType" ADD VALUE IF NOT EXISTS 'WEATHER_PRODUCTS_GENERATE';
