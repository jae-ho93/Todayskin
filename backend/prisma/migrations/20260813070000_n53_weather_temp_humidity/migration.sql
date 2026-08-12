-- N53: 기상청 초단기실황(T1H 기온, REH 습도) 수집 확장.
-- expand 전용 — 기존 행은 null로 남고, 수집 실패 플래그 기본값은 false.
ALTER TABLE "weather_snapshots"
  ADD COLUMN "temperature" DOUBLE PRECISION,
  ADD COLUMN "humidity" DOUBLE PRECISION,
  ADD COLUMN "nowcast_collection_failed" BOOLEAN NOT NULL DEFAULT false;
