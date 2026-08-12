"""N13 계약 테스트 — inference-service 내부 경계.

검증: 내부 인증(401/503), 업로드 상한(413/415), 오류 매핑(422/500),
정상 경로(200), 지표(/metrics).
R6/R32: 추론 슬롯 혼잡(429), 미준비(503), /metrics 인증.
"""
import asyncio
import io

import main

SECRET = "test-shared-secret"
AUTH = {"X-Inference-Key": SECRET}


def _files(body: bytes, content_type: str = "image/jpeg", filename: str = "front.jpg"):
    return {"front": (filename, io.BytesIO(body), content_type)}


def _png(size: int = 200) -> bytes:
    # 최소 PNG 시그니처 + 패딩 (콘텐츠 타입 검증 대상이라 내용물은 무의미).
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * (size - 8)


def _jpeg(mb: int) -> bytes:
    return b"\xff\xd8\xff\xe0" + b"\x00" * (mb * 1024 * 1024 - 4)


def test_200_happy_path_with_auth(client):
    main.analyzer.behavior = {}
    res = client.post("/infer", files=_files(_png(300), "image/png"), headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["overallScore"] == 74
    assert body["modelVersion"] == "mobilenet_test-v1"
    assert len(body["parts"]) == 6


def test_401_missing_header(client):
    res = client.post("/infer", files=_files(_png(100)))
    assert res.status_code == 401


def test_401_wrong_secret(client):
    res = client.post(
        "/infer", files=_files(_png(100)), headers={"X-Inference-Key": "wrong-secret"}
    )
    assert res.status_code == 401


def test_503_secret_not_configured(client, monkeypatch):
    monkeypatch.delenv("INFERENCE_SHARED_SECRET")
    res = client.post("/infer", files=_files(_png(100)), headers=AUTH)
    assert res.status_code == 503


def test_413_file_too_large(client):
    res = client.post("/infer", files=_files(_jpeg(11)), headers=AUTH)
    assert res.status_code == 413


def test_415_wrong_content_type(client):
    res = client.post("/infer", files=_files(b"hello", "text/plain"), headers=AUTH)
    assert res.status_code == 415


def test_422_no_face_detected(client):
    main.analyzer.behavior = {"raise": "no_face"}
    res = client.post("/infer", files=_files(_png(100)), headers=AUTH)
    assert res.status_code == 422
    # N49: 422 detail은 {code, message} 구조 — FE가 code로 재촬영 안내를 분기한다.
    detail = res.json()["detail"]
    assert detail["code"] == "NO_FACE"
    assert "얼굴" in detail["message"]


# ── N49: 품질 게이트 (전처리 검증) ─────────────────────────────────────


def test_422_quality_gate_rejects_with_reason_code(client):
    import quality

    main.analyzer.behavior = {}
    quality.quality_issue = quality.QualityIssue(
        "TOO_DARK", "사진이 너무 어둡습니다. 밝은 곳에서 다시 촬영해주세요"
    )
    res = client.post("/infer", files=_files(_png(100)), headers=AUTH)
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert detail["code"] == "TOO_DARK"
    assert "어둡" in detail["message"]


def test_quality_gate_pass_reaches_inference(client):
    import quality

    main.analyzer.behavior = {}
    quality.quality_issue = None
    res = client.post("/infer", files=_files(_png(100)), headers=AUTH)
    assert res.status_code == 200


def test_500_inference_error(client):
    main.analyzer.behavior = {"raise": "error"}
    res = client.post("/infer", files=_files(_png(100)), headers=AUTH)
    assert res.status_code == 500


def test_503_inference_timeout(client, monkeypatch):
    # N13: 실행 timeout — 0.05s로 줄이고 0.2s 걸리는 추론을 보내 503을 확인한다.
    monkeypatch.setenv("INFERENCE_TIMEOUT_SECONDS", "0.05")
    main.analyzer.behavior = {"sleep": 0.2}
    res = client.post("/infer", files=_files(_png(100)), headers=AUTH)
    assert res.status_code == 503


def test_metrics_exposes_queue_execution_and_concurrency(client):
    res = client.get("/metrics", headers=AUTH)
    assert res.status_code == 200
    assert "text/plain" in res.headers["content-type"]
    text = res.text
    assert "inference_requests_total" in text
    assert "inference_in_flight" in text
    assert "inference_queue_wait_seconds" in text
    assert "inference_execution_seconds" in text
    assert "inference_queue_timeouts_total" in text
    assert "inference_concurrency_limit 1" in text


def test_metrics_records_status_counts(client):
    main.analyzer.behavior = {}
    # 앞선 테스트가 이미 카운터를 올렸을 수 있으므로 "증가"를 검증한다.
    def count(text: str, status: str) -> int:
        import re

        m = re.search(rf'inference_requests_total{{status="{status}"}} (\d+)', text)
        return int(m.group(1)) if m else 0

    before = client.get("/metrics", headers=AUTH).text
    client.post("/infer", files=_files(_png(100)))  # 401 (인증 실패)
    client.post("/infer", files=_files(_png(100)), headers=AUTH)  # 200
    after = client.get("/metrics", headers=AUTH).text
    assert count(after, "200") == count(before, "200") + 1
    assert count(after, "401") == count(before, "401") + 1


# ── R32: /metrics 인증 ────────────────────────────────────────────────


def test_metrics_401_without_key(client):
    assert client.get("/metrics").status_code == 401


def test_metrics_401_with_wrong_key(client):
    res = client.get("/metrics", headers={"X-Inference-Key": "wrong-secret"})
    assert res.status_code == 401


def test_metrics_503_when_secret_not_configured(client, monkeypatch):
    monkeypatch.delenv("INFERENCE_SHARED_SECRET")
    assert client.get("/metrics", headers=AUTH).status_code == 503


def test_health_stays_public(client):
    """ECS 컨테이너 헬스체크가 호출하므로 /health만 무인증을 유지한다."""
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


# ── R6: 추론 슬롯 ─────────────────────────────────────────────────────


def test_health_503_when_model_not_ready(client, monkeypatch):
    monkeypatch.setattr(main, "analyzer", None)
    assert client.get("/health").status_code == 503


def test_infer_503_when_model_not_ready(client, monkeypatch):
    monkeypatch.setattr(main, "analyzer_pool", None)
    res = client.post("/infer", files=_files(_png(100)), headers=AUTH)
    assert res.status_code == 503


def test_429_when_slot_wait_times_out(client, monkeypatch):
    """슬롯 대기 상한 초과 시 429 + Retry-After — NestJS가 즉시 fallback한다."""

    class BusySlots:
        async def acquire(self) -> None:
            await asyncio.sleep(10)

        def release(self) -> None:  # pragma: no cover - 도달하지 않는다
            raise AssertionError("슬롯을 잡지 못했으므로 release되지 않아야 한다")

    monkeypatch.setattr(main, "inference_slots", BusySlots())
    monkeypatch.setenv("INFERENCE_QUEUE_TIMEOUT_SECONDS", "0.05")

    before = _metric_value(client, "inference_queue_timeouts_total")
    res = client.post("/infer", files=_files(_png(100)), headers=AUTH)
    assert res.status_code == 429
    assert res.headers["Retry-After"] == "1"
    assert _metric_value(client, "inference_queue_timeouts_total") == before + 1


def test_concurrency_env_builds_multiple_slots(make_client):
    client = make_client(concurrency=2)
    assert main.analyzer_pool.qsize() == 2
    assert "inference_concurrency_limit 2" in client.get("/metrics", headers=AUTH).text
    # 인스턴스가 각각 독립이어야 한다 (모델 인스턴스는 스레드 안전하지 않다).
    instances = list(main.analyzer_pool.queue)
    assert len({id(i) for i in instances}) == 2


def test_concurrency_env_clamped_to_max(make_client):
    client = make_client(concurrency=99)
    assert f"inference_concurrency_limit {main.MAX_CONCURRENCY}" in client.get(
        "/metrics", headers=AUTH
    ).text


def _metric_value(client, name: str) -> float:
    import re

    text = client.get("/metrics", headers=AUTH).text
    m = re.search(rf"^{name} (\S+)$", text, re.MULTILINE)
    assert m, f"{name} 지표가 없습니다"
    return float(m.group(1))
