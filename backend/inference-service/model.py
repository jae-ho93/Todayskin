"""Shared backbone (pluggable: MobileNetV3-Small/Large, EfficientNet-B0,
ResNet50) + one small expert head per facepart.

Every crop (whichever facepart it's from) goes through the SAME backbone
weights -> a region-agnostic skin-texture feature vector. Each facepart then
has its own tiny head predicting that region's classification grades +
regression (equipment) values, since the label schema differs per region.
"""
import torch.nn as nn

from backbones import build_backbone
from regions import LABEL_SCHEMA

FEATURE_DIM = 128


class FacepartHead(nn.Module):
    def __init__(self, in_dim: int, classification: dict, regression: list, dropout: float = 0.2):
        super().__init__()
        self.trunk = nn.Sequential(
            nn.Linear(in_dim, FEATURE_DIM),
            nn.Hardswish(),
            nn.Dropout(dropout),
        )
        self.cls_heads = nn.ModuleDict({
            name: nn.Linear(FEATURE_DIM, n_classes)
            for name, n_classes in classification.items()
        })
        self.regression_names = list(regression)
        self.reg_head = (nn.Linear(FEATURE_DIM, len(regression))
                          if regression else None)

    def forward(self, feat):
        h = self.trunk(feat)
        cls_logits = {name: head(h) for name, head in self.cls_heads.items()}
        reg_out = self.reg_head(h) if self.reg_head is not None else None
        return cls_logits, reg_out


class SkinModel(nn.Module):
    def __init__(self, backbone_name: str = "mobilenet_v3_small",
                 pretrained: bool = True, dropout: float = 0.2):
        super().__init__()
        self.backbone_name = backbone_name
        self.backbone = build_backbone(backbone_name, pretrained=pretrained)
        self.heads = nn.ModuleDict({
            str(part_id): FacepartHead(
                self.backbone.out_dim,
                schema["classification"],
                schema["regression"],
                dropout=dropout,
            )
            for part_id, schema in LABEL_SCHEMA.items()
        })

    def forward(self, x, facepart_id: int):
        feat = self.backbone(x)
        return self.heads[str(facepart_id)](feat)
