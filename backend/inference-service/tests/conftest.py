"""N13 계약 테스트 픽스처.

모델 스택(torch/mediapipe)은 무겁고 HTTP 계약 테스트(인증/상한/에러)에는 필요
없으므로, main을 import하기 전에 `analyzer`/`part_mapping` 모듈을 sys.modules에
stub으로 설치한다. 이렇게 하면 모델 의존성 없이 FastAPI 앱 전체를 테스트할 수 있다.
"""
from __future__ import annotations

import os
import sys
import time
import types

import pytest

TEST_SECRET = "test-shared-secret"

# 6부위 고정 응답 (NestJS InferenceResult 계약과 1:1 대응).
FIXED_PARTS = [
    {"part": "forehead", "label": "이마", "grade": "보통", "moisture": 63.6, "elasticity": 59.6, "note": None},
    {"part": "glabella", "label": "미간", "grade": "양호", "moisture": None, "elasticity": None, "note": None},
    {"part": "eyeArea", "label": "눈가", "grade": "보통", "moisture": None, "elasticity": None, "note": None},
    {"part": "cheek", "label": "볼", "grade": "보통", "moisture": 55.0, "elasticity": 52.0, "note": None},
    {"part": "lips", "label": "입술", "grade": "양호", "moisture": None, "elasticity": None, "note": None},
    {"part": "jaw", "label": "턱", "grade": "보통", "moisture": 60.0, "elasticity": 58.0, "note": None},
]


def _install_stubs() -> None:
    analyzer_mod = types.ModuleType("analyzer")

    class NoFaceDetected(Exception):
        pass

    class SkinAnalyzer:
        model_version = "mobilenet_test-v1"

        def __init__(self, behavior: dict | None = None) -> None:
            self.behavior = behavior or {}

        def analyze(self, image_bytes: bytes) -> dict:
            if self.behavior.get("raise") == "no_face":
                raise NoFaceDetected("no face detected")
            if self.behavior.get("raise") == "error":
                raise RuntimeError("boom")
            sleep = self.behavior.get("sleep")
            if sleep:
                time.sleep(sleep)
            return {
                "parts": {
                    "forehead": {"score": 74.0, "regression": {}, "classification": {}},
                },
                "overall_score": 74.0,
                "landmarks": None,
            }

        def close(self) -> None:
            pass

    analyzer_mod.NoFaceDetected = NoFaceDetected
    analyzer_mod.SkinAnalyzer = SkinAnalyzer
    sys.modules["analyzer"] = analyzer_mod

    part_mapping_mod = types.ModuleType("part_mapping")

    def map_to_app_schema(analysis: dict, model_version: str) -> dict:
        return {
            "overallScore": round(analysis["overall_score"]),
            "modelVersion": model_version,
            "parts": FIXED_PARTS,
            "landmarks": None,
        }

    part_mapping_mod.map_to_app_schema = map_to_app_schema
    sys.modules["part_mapping"] = part_mapping_mod

    # N49: quality도 cv2/numpy 의존이라 stub한다. 계약 테스트에서는
    # quality_issue 전역으로 판정 결과를 주입하고, 실제 판정 로직은
    # test_quality.py가 real module로 검증한다.
    quality_mod = types.ModuleType("quality")
    quality_mod.quality_issue = None

    class QualityIssue:
        def __init__(self, code: str, message: str) -> None:
            self.code = code
            self.message = message

    def evaluate_quality(image_bytes: bytes):
        return quality_mod.quality_issue

    quality_mod.QualityIssue = QualityIssue
    quality_mod.evaluate_quality = evaluate_quality
    sys.modules["quality"] = quality_mod


_install_stubs()

import main  # noqa: E402  (stub 설치 후 import)


@pytest.fixture()
def client():
    os.environ["INFERENCE_SHARED_SECRET"] = TEST_SECRET
    os.environ.pop("INFERENCE_CONCURRENCY", None)
    # N49: 이전 테스트가 주입한 품질 판정을 초기화한다.
    sys.modules["quality"].quality_issue = None
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        yield c


@pytest.fixture()
def make_client():
    """R6: 슬롯 수(INFERENCE_CONCURRENCY)를 바꿔 앱을 띄우는 팩토리."""
    from fastapi.testclient import TestClient

    created = []

    def _make(concurrency: int = 1):
        os.environ["INFERENCE_SHARED_SECRET"] = TEST_SECRET
        os.environ["INFERENCE_CONCURRENCY"] = str(concurrency)
        c = TestClient(main.app)
        c.__enter__()
        created.append(c)
        return c

    yield _make
    for c in reversed(created):
        c.__exit__(None, None, None)
    os.environ.pop("INFERENCE_CONCURRENCY", None)
