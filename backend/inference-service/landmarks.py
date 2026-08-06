"""MediaPipe Face Landmarker wrapper: image -> 478 face landmarks (pixel coords)."""
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    FaceLandmarker,
    FaceLandmarkerOptions,
    RunningMode,
)

MODEL_PATH = Path(__file__).resolve().parent / "assets" / "face_landmarker.task"

# Iris landmarks are only present when the task's built-in blendshape/attention
# mesh is used, which face_landmarker.task always provides -> 478 points total.
LEFT_IRIS_CENTER = 468
RIGHT_IRIS_CENTER = 473


class FaceLandmarkDetector:
    def __init__(self, model_path: Path = MODEL_PATH):
        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._landmarker = FaceLandmarker.create_from_options(options)

    def detect(self, image_bgr: np.ndarray) -> np.ndarray | None:
        """Returns (478, 2) float32 array of pixel coords, or None if no face found."""
        h, w = image_bgr.shape[:2]
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
        result = self._landmarker.detect(mp_image)
        if not result.face_landmarks:
            return None
        pts = result.face_landmarks[0]
        return np.array([[p.x * w, p.y * h] for p in pts], dtype=np.float32)

    def close(self):
        self._landmarker.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
