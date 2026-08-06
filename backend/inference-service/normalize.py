"""Face normalization: rotate so the eyes are level, scale by IPD (inter-pupillary
distance) so every face lands at the same size, on a fixed canonical canvas.

This is the shared coordinate system both the training-data builder and the
production inference pipeline use, so a relative ROI template means the same
thing in both places regardless of how the photo was framed.
"""
from dataclasses import dataclass

import cv2
import numpy as np

from landmarks import LEFT_IRIS_CENTER, RIGHT_IRIS_CENTER

# Canonical output canvas + where the eye-center is anchored inside it.
# Chosen so forehead (~0.87 IPD above eye line) and chin (~1.63 IPD below)
# both fit with margin; verified visually in scripts/02_preview_crops.py.
IPD_REF = 200.0
CANVAS_W = 800
CANVAS_H = 900
EYE_ANCHOR = (400.0, 380.0)


@dataclass
class NormResult:
    matrix: np.ndarray  # 2x3 affine, original-image px -> normalized-canvas px
    ipd: float
    angle_deg: float
    landmarks_norm: np.ndarray  # (478, 2) in normalized-canvas coords


def compute_normalization(landmarks: np.ndarray) -> NormResult:
    left_eye = landmarks[LEFT_IRIS_CENTER]
    right_eye = landmarks[RIGHT_IRIS_CENTER]
    eye_center = (left_eye + right_eye) / 2.0

    dx, dy = right_eye - left_eye
    ipd = float(np.hypot(dx, dy))
    theta = np.arctan2(dy, dx)  # current eye-line angle; rotate by -theta to level it

    scale = IPD_REF / ipd
    cos_t, sin_t = np.cos(theta), np.sin(theta)
    rot = np.array([[cos_t, sin_t], [-sin_t, cos_t]], dtype=np.float64)
    A = scale * rot
    anchor = np.array(EYE_ANCHOR, dtype=np.float64)
    t = anchor - A @ eye_center

    matrix = np.hstack([A, t.reshape(2, 1)])
    landmarks_norm = transform_points(landmarks, matrix)

    return NormResult(matrix=matrix, ipd=ipd, angle_deg=float(np.degrees(theta)),
                       landmarks_norm=landmarks_norm)


def transform_points(points: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """points: (N, 2) in original-image px -> (N, 2) in normalized-canvas px."""
    return (matrix[:, :2] @ points.T).T + matrix[:, 2]


def warp_image(image_bgr: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    return cv2.warpAffine(image_bgr, matrix, (CANVAS_W, CANVAS_H),
                           flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
