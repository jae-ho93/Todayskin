"""Pluggable backbone factory so the same training engine and facepart heads
can run on ResNet50, MobileNetV3-Large, or EfficientNet-B0. Every backbone
exposes the same shape: `.features` (an nn.Sequential of blocks, used for
the "freeze the first N blocks" logic) + `.avgpool` + `.out_dim`.
"""
import torch
import torch.nn as nn
import torchvision


class Backbone(nn.Module):
    def __init__(self, features: nn.Sequential, avgpool: nn.Module, out_dim: int, n_blocks: int):
        super().__init__()
        self.features = features
        self.avgpool = avgpool
        self.out_dim = out_dim
        self.n_blocks = n_blocks  # informational, for freeze_layers sanity checks

    def forward(self, x):
        x = self.features(x)
        x = self.avgpool(x)
        return torch.flatten(x, 1)


def build_backbone(name: str, pretrained: bool = True) -> Backbone:
    if name == "mobilenet_v3_small":
        weights = torchvision.models.MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
        m = torchvision.models.mobilenet_v3_small(weights=weights)
        return Backbone(m.features, m.avgpool, m.classifier[0].in_features,
                         n_blocks=len(list(m.features.children())))

    if name == "mobilenet_v3_large":
        weights = torchvision.models.MobileNet_V3_Large_Weights.IMAGENET1K_V2 if pretrained else None
        m = torchvision.models.mobilenet_v3_large(weights=weights)
        return Backbone(m.features, m.avgpool, m.classifier[0].in_features,
                         n_blocks=len(list(m.features.children())))

    if name == "efficientnet_b0":
        weights = torchvision.models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
        m = torchvision.models.efficientnet_b0(weights=weights)
        return Backbone(m.features, m.avgpool, m.classifier[1].in_features,
                         n_blocks=len(list(m.features.children())))

    if name == "resnet50":
        weights = torchvision.models.ResNet50_Weights.IMAGENET1K_V2 if pretrained else None
        m = torchvision.models.resnet50(weights=weights)
        # ResNet has no `.features`; group into 5 coarse blocks (stem + 4
        # residual stages) so the same "freeze first N blocks" logic applies.
        stem = nn.Sequential(m.conv1, m.bn1, m.relu, m.maxpool)
        features = nn.Sequential(stem, m.layer1, m.layer2, m.layer3, m.layer4)
        return Backbone(features, m.avgpool, m.fc.in_features, n_blocks=5)

    raise ValueError(f"unknown backbone '{name}'; choose from "
                      f"mobilenet_v3_small, mobilenet_v3_large, efficientnet_b0, resnet50")
