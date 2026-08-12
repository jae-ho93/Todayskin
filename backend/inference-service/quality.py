"""N49: 추론 이미지 품질 게이트 — 전처리 검증.

어둡거나 흔들리거나 너무 작은 사진은 모델이 점수를 내더라도 신뢰할 수 없다.
추론 슬롯을 잡기 전에(모델 비용 없이) 거부해 사용자에게 재촬영을 안내한다.

검사 순서와 사유 코드:
1. TOO_SMALL  — 짧은 변이 최소 해상도 미만 (저해상도 스크린샷/썸네일)
2. TOO_DARK   — 그레이스케일 평균 휘도가 임계값 미만 (블러 판정은 어두운
                사진에서 신뢰할 수 없어 어두움을 먼저 본다)
3. BLURRY     — 라플라시안 분산이 임계값 미만 (모션 블러/초점 이탈).
                해상도에 따라 분산 스케일이 달라져 장변 640px로 축소 후 계산한다.

임계값은 환경변수로 조정한다(기본값은 보수적으로 — 데모에서 오탐으로 정상
사진을 거부하는 것이 미검출보다 나쁘다). 0으로 두면 해당 검사를 끈다.
디코딩 실패는 게이트가 판정하지 않고 None을 반환한다 — 분석기(analyzer)의
기존 디코딩 오류 경로(400)가 일관되게 처리한다.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import cv2
import numpy as np

DEFAULT_MIN_EDGE_PX = 480
DEFAULT_MIN_MEAN_LUMA = 55.0  # 0~255
DEFAULT_MIN_LAPLACIAN_VAR = 40.0
BLUR_RESIZE_LONG_EDGE = 640


@dataclass(frozen=True)
class QualityIssue:
    code: str  # TOO_SMALL | TOO_DARK | BLURRY
    message: str


def evaluate_quality(image_bytes: bytes) -> QualityIssue | None:
    """품질 미달이면 QualityIssue, 통과(또는 판정 불가)면 None."""
    buf = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        return None  # 디코딩 오류는 analyzer의 400 경로가 처리한다.

    height, width = img.shape[:2]

    min_edge = _env_float("QUALITY_MIN_EDGE_PX", DEFAULT_MIN_EDGE_PX)
    if min_edge > 0 and min(height, width) < min_edge:
        return QualityIssue(
            code="TOO_SMALL",
            message=f"사진 해상도가 너무 낮습니다 (짧은 변 최소 {int(min_edge)}px)",
        )

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    min_luma = _env_float("QUALITY_MIN_MEAN_LUMA", DEFAULT_MIN_MEAN_LUMA)
    if min_luma > 0 and float(gray.mean()) < min_luma:
        return QualityIssue(
            code="TOO_DARK",
            message="사진이 너무 어둡습니다. 밝은 곳에서 다시 촬영해주세요",
        )

    min_lap_var = _env_float("QUALITY_MIN_LAPLACIAN_VAR", DEFAULT_MIN_LAPLACIAN_VAR)
    if min_lap_var > 0 and _laplacian_variance(gray) < min_lap_var:
        return QualityIssue(
            code="BLURRY",
            message="사진이 흔들렸거나 초점이 맞지 않습니다. 다시 촬영해주세요",
        )

    return None


def _laplacian_variance(gray: np.ndarray) -> float:
    """장변을 640px로 정규화한 뒤 라플라시안 분산을 계산한다.

    분산은 해상도에 비례해 커지므로 고정 크기로 맞춰야 임계값이
    업로드 해상도(F72 리사이즈 1440px, 원본 등)와 무관하게 동작한다.
    """
    height, width = gray.shape[:2]
    long_edge = max(height, width)
    if long_edge > BLUR_RESIZE_LONG_EDGE:
        scale = BLUR_RESIZE_LONG_EDGE / long_edge
        gray = cv2.resize(
            gray,
            (max(1, round(width * scale)), max(1, round(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _env_float(name: str, default: float) -> float:
    """요청 시점에 읽어 테스트에서 monkeypatch할 수 있게 한다."""
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return float(default)
    try:
        return float(raw)
    except ValueError:
        return float(default)
