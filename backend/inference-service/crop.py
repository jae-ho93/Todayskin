"""Apply the universal ROI templates to a normalized face to get per-facepart
crops. Same function used at training-dataset build time and at inference
time -- that identity is the whole point of the pipeline."""
import json
from pathlib import Path

import numpy as np

from normalize import CANVAS_H, CANVAS_W

TEMPLATES_PATH = Path(__file__).resolve().parent / "assets" / "templates.json"


def load_templates(path: Path = TEMPLATES_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    boxes = {}
    for part_id, entry in data["faceparts"].items():
        boxes[int(part_id)] = entry["box"]  # [x1, y1, x2, y2]
    # facepart 0 ("face_whole", used for acne) is the whole frame, not a
    # data-derived box -- its raw AI Hub bbox is always the full image, so
    # deriving a tight box from it is meaningless noise.
    boxes[0] = [0.0, 0.0, float(CANVAS_W), float(CANVAS_H)]
    return boxes


def crop_facepart(normalized_img: np.ndarray, box: list[float], margin: float = 0.0):
    """box: [x1,y1,x2,y2] in normalized-canvas px. margin: fraction of box size
    to pad on each side (e.g. 0.1 = +10%), clipped to canvas bounds."""
    h, w = normalized_img.shape[:2]
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    x1 -= bw * margin
    x2 += bw * margin
    y1 -= bh * margin
    y2 += bh * margin
    x1, y1 = max(0, int(round(x1))), max(0, int(round(y1)))
    x2, y2 = min(w, int(round(x2))), min(h, int(round(y2)))
    return normalized_img[y1:y2, x1:x2]
