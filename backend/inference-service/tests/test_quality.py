"""N49: 품질 게이트 실로직 테스트 — 합성 이미지로 임계값 판정을 검증한다.

conftest가 quality를 stub하므로(계약 테스트용), 여기서는 실제 quality.py를
파일 경로에서 별도 이름으로 로드한다. cv2/numpy가 필요하다(requirements-dev).
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

cv2 = pytest.importorskip("cv2")
np = pytest.importorskip("numpy")


def _load_real_quality():
    path = Path(__file__).resolve().parent.parent / "quality.py"
    spec = importlib.util.spec_from_file_location("quality_real", path)
    module = importlib.util.module_from_spec(spec)
    # dataclass 데코레이터가 sys.modules[cls.__module__]를 조회하므로 등록이 필요하다.
    sys.modules["quality_real"] = module
    spec.loader.exec_module(module)
    return module


quality = _load_real_quality()


def _jpeg_bytes(img: "np.ndarray") -> bytes:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    assert ok
    return buf.tobytes()


def _sharp_bright_image(height: int = 960, width: int = 720) -> "np.ndarray":
    """밝고 대비가 큰 체커보드 — 어둡지도 흐리지도 않은 기준 이미지."""
    rng = np.random.default_rng(42)
    tile = rng.integers(90, 255, size=(height // 8, width // 8), dtype=np.uint8)
    gray = np.kron(tile, np.ones((8, 8), dtype=np.uint8))[:height, :width]
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def test_sharp_bright_photo_passes():
    assert quality.evaluate_quality(_jpeg_bytes(_sharp_bright_image())) is None


def test_too_small_rejected():
    small = _sharp_bright_image(height=320, width=240)
    issue = quality.evaluate_quality(_jpeg_bytes(small))
    assert issue is not None and issue.code == "TOO_SMALL"


def test_too_dark_rejected():
    dark = np.full((960, 720, 3), 12, dtype=np.uint8)
    issue = quality.evaluate_quality(_jpeg_bytes(dark))
    assert issue is not None and issue.code == "TOO_DARK"


def test_blurry_rejected():
    blurred = cv2.GaussianBlur(_sharp_bright_image(), (61, 61), 0)
    issue = quality.evaluate_quality(_jpeg_bytes(blurred))
    assert issue is not None and issue.code == "BLURRY"


def test_dark_wins_over_blur():
    """어두운 사진은 블러 판정이 무의미하므로 TOO_DARK가 먼저다."""
    dark_and_flat = np.full((960, 720, 3), 12, dtype=np.uint8)
    issue = quality.evaluate_quality(_jpeg_bytes(dark_and_flat))
    assert issue is not None and issue.code == "TOO_DARK"


def test_thresholds_zero_disable_checks(monkeypatch):
    monkeypatch.setenv("QUALITY_MIN_EDGE_PX", "0")
    monkeypatch.setenv("QUALITY_MIN_MEAN_LUMA", "0")
    monkeypatch.setenv("QUALITY_MIN_LAPLACIAN_VAR", "0")
    dark_small = np.full((100, 100, 3), 5, dtype=np.uint8)
    assert quality.evaluate_quality(_jpeg_bytes(dark_small)) is None


def test_threshold_env_override(monkeypatch):
    """임계값을 올리면 기준 이미지도 거부된다 — env 반영 확인."""
    monkeypatch.setenv("QUALITY_MIN_MEAN_LUMA", "250")
    issue = quality.evaluate_quality(_jpeg_bytes(_sharp_bright_image()))
    assert issue is not None and issue.code == "TOO_DARK"


def test_undecodable_bytes_defer_to_analyzer():
    """디코딩 실패는 게이트가 판정하지 않는다 (analyzer의 400 경로 유지)."""
    assert quality.evaluate_quality(b"not-an-image") is None
