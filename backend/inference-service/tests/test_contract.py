"""N13 계약 테스트 — inference-service 내부 경계.

검증: 내부 인증(401/503), 업로드 상한(413/415), 오류 매핑(422/500),
정상 경로(200), 지표(/metrics).
"""
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
    assert "얼굴" in res.json()["detail"]


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
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "text/plain" in res.headers["content-type"]
    text = res.text
    assert "inference_requests_total" in text
    assert "inference_in_flight" in text
    assert "inference_queue_wait_seconds" in text
    assert "inference_execution_seconds" in text


def test_metrics_records_status_counts(client):
    main.analyzer.behavior = {}
    # 앞선 테스트가 이미 카운터를 올렸을 수 있으므로 "증가"를 검증한다.
    def count(text: str, status: str) -> int:
        import re

        m = re.search(rf'inference_requests_total{{status="{status}"}} (\d+)', text)
        return int(m.group(1)) if m else 0

    before = client.get("/metrics").text
    client.post("/infer", files=_files(_png(100)))  # 401 (인증 실패)
    client.post("/infer", files=_files(_png(100)), headers=AUTH)  # 200
    after = client.get("/metrics").text
    assert count(after, "200") == count(before, "200") + 1
    assert count(after, "401") == count(before, "401") + 1
