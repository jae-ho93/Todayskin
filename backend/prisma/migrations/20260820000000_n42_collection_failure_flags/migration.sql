-- N42: 수집 실패와 값 없음을 구분한다
--
-- 진단 스냅샷의 대기질이 전부 null로 남은 사례가 있었다. 화면은 null을 `-`로
-- 그리므로 사용자에게는 "못 불러온다"로 보이는데, 실제로는 저장 시점에 이미
-- 비어 있었다. 지금 구조로는 그게 일시적 장애 때문인지 원래 값이 없었던 건지
-- 구별할 수 없다.
--
-- 기존 행은 false로 둔다. 소급해서 알아낼 방법이 없기 때문이다 — 지표가 전부
-- null이어도 그게 실패였는지 측정값 부재였는지 판단할 근거가 남아 있지 않다.
-- 화면은 기존 행을 지금처럼 `-`로 보여주며, 이는 우리가 아는 만큼만 말하는 것이다.
ALTER TABLE "weather_snapshots"
  ADD COLUMN "uv_collection_failed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "air_collection_failed" BOOLEAN NOT NULL DEFAULT false;
