"""YOLOv8 여드름 병변 탐지 + 9부위 등급 모델과 같은 정규화 좌표계 템플릿을 이용한
구역별(이마/볼/턱 등) 매핑, 한글 텍스트 리포트 생성.

바운딩 박스를 이미지에 그려서 보여주지 않고(사용자 요청), 부위별 개수만 문장으로
알려준다: "왼쪽 볼에 비염증성 여드름 2개, 염증성 여드름 1개가 있습니다."

YOLO는 우리 자체 normalize/warp 파이프라인이 아니라 AI Hub 원본 사진(워프 없음)으로
학습됐으므로, 9부위 등급 모델과 달리 warp된 캔버스가 아니라 원본 업로드 이미지에 대해
그대로 추론한다. 구역 판정만 9부위 모델과 같은 템플릿(정규화 좌표계) 박스를 역변환해
원본 좌표로 가져와 재사용한다.
"""
from pathlib import Path

import numpy as np
from ultralytics import YOLO

from crop import load_templates
from normalize import compute_normalization
from regions import FACEPART_NAMES

ASSETS_DIR = Path(__file__).resolve().parent / "assets"

CLASS_NAMES = {0: "non_inflammatory", 1: "inflammatory"}

ZONE_LABELS = {
    "forehead": "이마",
    "glabellus": "미간",
    "l_perocular": "왼쪽 눈가",
    "r_perocular": "오른쪽 눈가",
    "l_cheek": "왼쪽 볼",
    "r_cheek": "오른쪽 볼",
    "lip": "입술",
    "chin": "턱",
}
# face_whole(0)은 전체 프레임 박스라 구역으로 의미가 없어 제외.
ZONE_PART_IDS = [pid for pid in FACEPART_NAMES if pid != 0]

# v2 체크포인트 자체가 약함(mAP50 0.197, MODELS.md 참고) -- 0.25는 실사용 사진에서
# 탐지가 거의 안 나올 만큼 보수적이라 0.15로 낮춰 최소한의 결과는 보이게 한다.
# 오탐도 늘긴 하지만, 지금 목적(텍스트 리포트 품질 확인)에는 아예 안 나오는 것보다 낫다.
CONF_THRESHOLD = 0.15


class AcneDetector:
    def __init__(self, weights_path: Path = ASSETS_DIR / "acne_yolov8n.pt"):
        self.model = YOLO(str(weights_path))
        self.templates = load_templates()

    def _zone_rects_in_image_space(self, landmarks: np.ndarray) -> dict[int, tuple[float, float, float, float]]:
        """정규화 캔버스 좌표계의 부위 박스를 역변환해 원본 이미지 픽셀 좌표의 축정렬
        사각형으로 근사한다 (회전각이 작아 근사 오차는 무시할 만함)."""
        res = compute_normalization(landmarks)
        A = res.matrix[:, :2]
        t = res.matrix[:, 2]
        A_inv = np.linalg.inv(A)

        rects = {}
        for part_id in ZONE_PART_IDS:
            x1, y1, x2, y2 = self.templates[part_id]
            corners_norm = np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])
            corners_orig = (corners_norm - t) @ A_inv.T
            rects[part_id] = (
                float(corners_orig[:, 0].min()), float(corners_orig[:, 1].min()),
                float(corners_orig[:, 0].max()), float(corners_orig[:, 1].max()),
            )
        return rects

    def _assign_zone(self, cx: float, cy: float, rects: dict) -> int | None:
        """검출 중심점을 포함하는 가장 가까운 구역을 찾는다. 어떤 사각형에도 안 들어가면
        (눈가 사이 콧대 등 구역 밖) 가장 가까운 구역 중심으로 fallback한다."""
        best_inside_id, best_inside_dist = None, float("inf")
        best_any_id, best_any_dist = None, float("inf")
        for part_id, (x1, y1, x2, y2) in rects.items():
            zone_cx, zone_cy = (x1 + x2) / 2, (y1 + y2) / 2
            dist = (cx - zone_cx) ** 2 + (cy - zone_cy) ** 2
            if dist < best_any_dist:
                best_any_id, best_any_dist = part_id, dist
            if x1 <= cx <= x2 and y1 <= cy <= y2 and dist < best_inside_dist:
                best_inside_id, best_inside_dist = part_id, dist
        return best_inside_id if best_inside_id is not None else best_any_id

    def analyze(self, image_bgr: np.ndarray, landmarks: np.ndarray) -> dict:
        """image_bgr: 원본(워프 전) 이미지. landmarks: 그 이미지 기준 478점 픽셀 좌표."""
        result = self.model.predict(image_bgr, conf=CONF_THRESHOLD, verbose=False)[0]
        rects = self._zone_rects_in_image_space(landmarks)

        zone_counts: dict[int, dict[str, int]] = {}
        total_counts = {"non_inflammatory": 0, "inflammatory": 0}
        boxes = result.boxes
        for i in range(len(boxes)):
            cls_id = int(boxes.cls[i].item())
            x1, y1, x2, y2 = boxes.xyxy[i].tolist()
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            part_id = self._assign_zone(cx, cy, rects)
            if part_id is None:
                continue
            cls_name = CLASS_NAMES[cls_id]
            zone_counts.setdefault(part_id, {"non_inflammatory": 0, "inflammatory": 0})
            zone_counts[part_id][cls_name] += 1
            total_counts[cls_name] += 1

        return {
            "totalCount": total_counts["non_inflammatory"] + total_counts["inflammatory"],
            "nonInflammatoryCount": total_counts["non_inflammatory"],
            "inflammatoryCount": total_counts["inflammatory"],
            "reportText": self._generate_report(zone_counts),
        }

    def _generate_report(self, zone_counts: dict[int, dict[str, int]]) -> str:
        sentences = []
        for part_id in ZONE_PART_IDS:
            counts = zone_counts.get(part_id)
            if not counts:
                continue
            non_inf, inf = counts["non_inflammatory"], counts["inflammatory"]
            if non_inf == 0 and inf == 0:
                continue
            zone_label = ZONE_LABELS[FACEPART_NAMES[part_id]]
            pieces = []
            if non_inf:
                pieces.append(f"비염증성 여드름 {non_inf}개")
            if inf:
                pieces.append(f"염증성 여드름 {inf}개")
            sentences.append(f"{zone_label}에 {', '.join(pieces)}가 있습니다.")
        return " ".join(sentences) if sentences else "감지된 여드름 병변이 없습니다."
