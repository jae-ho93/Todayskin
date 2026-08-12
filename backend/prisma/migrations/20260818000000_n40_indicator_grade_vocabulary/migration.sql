-- N40: 지표별 등급 어휘 분리
--
-- 자외선은 기상청 5단계(낮음·보통·높음·매우높음·위험), 대기질은 에어코리아
-- 4단계(좋음·보통·나쁨·매우나쁨)를 쓴다. 하나의 AirStatus(3단계)를 공유하던 때는
-- 자외선지수 9가 "나쁨"으로 표기됐다.

-- 1) 대기질에 '매우나쁨' 추가.
--    PG 12+ 는 트랜잭션 안에서 ADD VALUE를 허용한다. 같은 트랜잭션에서 이 값을
--    '사용'하지만 않으면 되며, 여기서는 값 추가만 한다.
ALTER TYPE "AirStatus" ADD VALUE 'veryBad';

-- 2) 자외선 전용 등급 타입.
CREATE TYPE "UvLevel" AS ENUM ('low', 'moderate', 'high', 'veryHigh', 'danger');

-- 3) 자외선 컬럼을 새 타입으로 옮긴다.
--    기존 3단계 라벨(good/moderate/bad)에서는 '높음/매우높음/위험'을 복원할 수 없다.
--    같은 행에 원본 지수(uv_index)가 남아 있으므로 라벨을 매핑하지 않고 지수에서
--    다시 계산한다. 판정 기준은 weather-status.policy.ts 와 같아야 한다.
ALTER TABLE "weather_snapshots"
  ALTER COLUMN "uv_status" TYPE "UvLevel"
  USING (
    CASE
      WHEN "uv_index" IS NULL THEN NULL
      WHEN "uv_index" >= 11 THEN 'danger'
      WHEN "uv_index" >= 8 THEN 'veryHigh'
      WHEN "uv_index" >= 6 THEN 'high'
      WHEN "uv_index" >= 3 THEN 'moderate'
      ELSE 'low'
    END
  )::"UvLevel";

ALTER TABLE "weather_snapshots"
  ALTER COLUMN "uv_status_peak" TYPE "UvLevel"
  USING (
    CASE
      WHEN "uv_index_peak" IS NULL THEN NULL
      WHEN "uv_index_peak" >= 11 THEN 'danger'
      WHEN "uv_index_peak" >= 8 THEN 'veryHigh'
      WHEN "uv_index_peak" >= 6 THEN 'high'
      WHEN "uv_index_peak" >= 3 THEN 'moderate'
      ELSE 'low'
    END
  )::"UvLevel";
