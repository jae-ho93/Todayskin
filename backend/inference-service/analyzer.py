"""Production inference: in-memory photo bytes -> same normalize+crop pipeline
used in training -> trained SkinModel -> per-facepart classification grades +
regression (equipment) values, in original units.

Adapted from the training pipeline's src/infer.py: takes raw image bytes
(never written to disk) instead of a file path, since the NestJS backend
forwards the uploaded photo straight from memory and must not persist it.
"""
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from torchvision import transforms

from acne_detector import AcneDetector
from crop import crop_facepart, load_templates
from disease_classifier import DiseaseClassifier
from landmarks import FaceLandmarkDetector
from model import SkinModel
from normalize import compute_normalization, warp_image
from regions import FACEPART_NAMES, LABEL_SCHEMA
from scoring import compute_scores

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
CROP_MARGIN = 0.15

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
EVAL_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

# face_whole(0)은 분류 라벨이 없어 앱 스키마에서 쓰지 않는다 -- 추론도 건너뛴다.
SCORED_PART_IDS = [pid for pid in LABEL_SCHEMA if pid != 0]


class NoFaceDetected(Exception):
    pass


class SkinAnalyzer:
    def __init__(self, assets_dir: Path = ASSETS_DIR, device: str | None = None):
        self.device = torch.device(
            device or ("mps" if torch.backends.mps.is_available() else "cpu"))

        with open(assets_dir / "reg_stats.json", encoding="utf-8") as f:
            raw_stats = json.load(f)
        self.reg_stats = {int(pid): {k: tuple(v) for k, v in stats.items()}
                           for pid, stats in raw_stats.items()}

        with open(assets_dir / "args.json", encoding="utf-8") as f:
            run_args = json.load(f)
        backbone_name = run_args.get("backbone_name", "mobilenet_v3_small")
        dropout = run_args.get("dropout", 0.2)
        self.model_version = f"{backbone_name}-todayskin-v1"

        self.model = SkinModel(backbone_name=backbone_name, pretrained=False,
                                dropout=dropout).to(self.device)
        ckpt = torch.load(assets_dir / "best.pt", map_location=self.device)
        self.model.load_state_dict(ckpt["model_state"])
        self.model.eval()

        self.templates = load_templates()
        self.detector = FaceLandmarkDetector()

        # 신규: YOLO 여드름 탐지기 + 5클래스(건선/아토피/주사/지루/정상) 질환 분류기.
        # 둘 다 원본 업로드 이미지에 그대로 돈다(9부위 등급 모델의 warp 캔버스가 아님) --
        # 두 모델 다 AI Hub 원본 사진으로 학습됐지 우리 자체 정규화 파이프라인을 거치지 않았다.
        self.acne_detector = AcneDetector(assets_dir / "acne_yolov8n.pt")
        self.disease_classifier = DiseaseClassifier(
            assets_dir / "disease_classifier.pt", assets_dir / "disease_classes.json",
            device=self.device)

    def close(self):
        self.detector.close()

    def analyze(self, image_bytes: bytes) -> dict:
        """image_bytes: raw JPEG/PNG/WEBP bytes, decoded in-memory only --
        never written to disk, matching the app's no-raw-image-storage rule."""
        buf = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("could not decode image")

        pts = self.detector.detect(img)
        if pts is None:
            raise NoFaceDetected("no face detected in image")

        res = compute_normalization(pts)
        norm_img = warp_image(img, res.matrix)

        results = {}
        with torch.no_grad():
            for part_id in SCORED_PART_IDS:
                schema = LABEL_SCHEMA[part_id]
                crop = crop_facepart(norm_img, self.templates[part_id], margin=CROP_MARGIN)
                pil_img = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
                tensor = EVAL_TRANSFORM(pil_img).unsqueeze(0).to(self.device)

                cls_logits, reg_out = self.model(tensor, part_id)
                classification = {name: int(logits.argmax(dim=1).item())
                                   for name, logits in cls_logits.items()}

                regression = {}
                if reg_out is not None:
                    reg_out = reg_out.cpu().squeeze(0)
                    for i, name in enumerate(schema["regression"]):
                        mean, std = self.reg_stats[part_id][name]
                        regression[name] = float(reg_out[i].item() * std + mean)

                results[FACEPART_NAMES[part_id]] = {
                    "classification": classification,
                    "regression": regression,
                }

        scores = compute_scores(results)
        for part_name, score in scores["parts"].items():
            results[part_name]["score"] = score

        # 신규 모델 2종: 원본(워프 전) 이미지 + 원본 좌표계 랜드마크로 그대로 추론한다.
        acne_result = self.acne_detector.analyze(img, pts)
        disease_result = self.disease_classifier.classify(img)

        # N8/F36: 원본 이미지 기준 0~1 정규화 좌표의 얼굴 랜드마크(478점).
        # 프론트는 원본 사진 위에 viewBox 0 0 1 1로 오버레이하므로, 워프 캔버스(800x900)
        # 좌표가 아니라 원본 픽셀을 이미지 크기로 나눈 0~1 값으로 저장해야 정렬된다.
        h, w = img.shape[:2]
        landmarks_points = (pts / np.array([w, h], dtype=np.float64)).astype(float).tolist()
        return {
            "parts": results,
            "overall_score": scores["overall"],
            "landmarks": {
                "version": "mediapipe-face-landmarker-v1",
                "points": landmarks_points,
            },
            "acne_report": acne_result,
            "disease_classification": disease_result,
        }
