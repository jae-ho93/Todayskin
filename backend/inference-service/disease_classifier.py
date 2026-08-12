"""MobileNetV3-Small 5클래스(건선/아토피/주사/지루/정상) 전체 이미지 분류기.
여드름은 여기서 제외 -- acne_detector.py(YOLO)가 병변 위치/개수를 별도로 담당한다.
"""
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms
from torchvision.models import mobilenet_v3_small

ASSETS_DIR = Path(__file__).resolve().parent / "assets"

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
EVAL_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])


class DiseaseClassifier:
    def __init__(self, weights_path: Path = ASSETS_DIR / "disease_classifier.pt",
                 classes_path: Path = ASSETS_DIR / "disease_classes.json",
                 device: torch.device | None = None):
        import json
        self.device = device or torch.device(
            "mps" if torch.backends.mps.is_available() else "cpu")
        with open(classes_path, encoding="utf-8") as f:
            self.classes: list[str] = json.load(f)

        self.model = mobilenet_v3_small(weights=None)
        in_features = self.model.classifier[0].in_features
        self.model.classifier = nn.Sequential(
            nn.Linear(in_features, 256),
            nn.Hardswish(),
            nn.Dropout(0.2),
            nn.Linear(256, len(self.classes)),
        )
        ckpt = torch.load(weights_path, map_location=self.device)
        self.model.load_state_dict(ckpt["model_state"])
        self.model.to(self.device).eval()

    @torch.no_grad()
    def classify(self, image_bgr: np.ndarray) -> dict:
        pil_img = Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
        tensor = EVAL_TRANSFORM(pil_img).unsqueeze(0).to(self.device)
        logits = self.model(tensor)
        probs = torch.softmax(logits, dim=1).squeeze(0).cpu()
        top_idx = int(probs.argmax().item())
        return {
            "label": self.classes[top_idx],
            "confidence": round(float(probs[top_idx].item()), 4),
            "probabilities": {c: round(float(p), 4) for c, p in zip(self.classes, probs.tolist())},
        }
