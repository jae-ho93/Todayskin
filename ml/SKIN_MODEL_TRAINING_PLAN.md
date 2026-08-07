# 피부 진단 모델 학습 계획

ResNet / MobileNet / EfficientNet 3개 백본 비교실험 + 최종 추론 구조 정리. 학습 환경은 MacBook Air M4 24GB(PyTorch MPS 백엔드), 데이터는 AI Hub 피부 데이터셋 중 정면 이미지 몇천 장.

---

## 0. 공통 파이프라인 (3개 모델 모두 동일하게 적용)

3개를 공정하게 비교하려면 데이터 파이프라인·split·증강·평가지표는 반드시 동일해야 한다. 백본만 바꿔서 비교.

### 0.1 데이터 준비

```
AI Hub 원본 데이터
  → 정면(각도 0°) 이미지만 필터링
  → MediaPipe Face Mesh로 랜드마크 추출
  → 랜드마크 기준 바운딩박스 계산해 부위별 크롭 생성
      (이마, 미간, 좌눈가, 우눈가, 좌볼, 우볼, 입술, 턱, 전체얼굴 — 9개 크롭)
  → 등급 라벨 분포 확인 (양호/보통/심함 등 클래스 불균형 체크)
  → train / val / test = 80 / 10 / 10
```

**주의**: split은 반드시 **사람(원본 이미지 ID) 단위**로 나눈다. 크롭 단위로 나누면 같은 사람의 다른 부위 크롭이 train과 val에 동시에 들어가면서 검증 성능이 실제보다 부풀려진다(데이터 누수).

### 0.2 클래스 불균형 대응

라벨 분포를 세어본 뒤, 특정 등급(주로 "심함")이 희귀하면:
- 분류 loss에 `class_weight` 적용 (예: `CrossEntropyLoss(weight=...)`)
- 또는 희귀 클래스 오버샘플링

### 0.3 증강 (augmentation)

데이터가 몇천 장 수준이라 증강을 세게 건다.

- RandomHorizontalFlip (좌우 대칭 특성상 가능한 부위만 — 입술/미간 등은 주의)
- ColorJitter (brightness, contrast) — 조명 편차 대응
- RandomRotation(±10°), RandomResizedCrop(scale=0.85~1.0)
- 정규화는 각 백본의 ImageNet 사전학습 통계값(mean/std) 그대로 사용

### 0.4 입력 규격 (3개 모델 공통)

- 크롭 이미지를 224×224로 리사이즈 (세 백본 모두 224 기준으로 통일해 비교 조건을 맞춘다)
- 배치 크기: 24GB 통합메모리 기준 32~64 권장 (MPS 메모리 여유 봐가며 조정)

### 0.5 평가지표 (3개 모델 공통, 앞서 정리한 내용)

| 태스크 | 지표 | 집계 방식 |
|---|---|---|
| 등급 분류 | macro-F1 | 부위별로 계산 후 부위 간 macro-average |
| 측정값 회귀 | MAE | 부위별로 계산 후 부위 간 macro-average |

부위별 표를 항상 같이 리포트 (특정 부위만 유독 못하는 걸 숨기지 않기 위함).

### 0.6 학습 전략 공통 원칙

- 처음부터 전체 재학습(from scratch) 금지 — 반드시 ImageNet 사전학습 가중치에서 전이학습(fine-tuning)
- 초반 몇 epoch은 백본을 얼리고(freeze) head만 학습 → 이후 뒷쪽 블록(백본 후반부)까지 unfreeze해서 낮은 학습률로 추가 학습
- Early stopping: val macro-F1 / val MAE 기준으로 개선 없으면 중단 (patience 5~10 epoch)
- Optimizer: AdamW, weight decay 1e-4~1e-2

---

## 1. ResNet50 학습 방법

**역할**: 정확도 기준선(baseline). 3개 중 가장 무겁지만 검증된 구조.

| 항목 | 값 |
|---|---|
| 소스 | `torchvision.models.resnet50(weights=ResNet50_Weights.IMAGENET1K_V2)` |
| 파라미터 수 | 약 25M |
| Freeze 단계 | 1~3 epoch: `layer1`, `layer2` freeze / `layer3`, `layer4`, `fc` 학습 |
| Unfreeze 단계 | 4 epoch~: 전체 unfreeze, 학습률 1/10로 낮춤 |
| 학습률 | head: 3e-4 / 백본: 3e-5 (unfreeze 이후) |
| Epoch | 최대 30 (early stopping 적용) |
| 배치 크기 | 32 |
| 예상 특징 | 3개 중 가장 느리고 메모리 많이 씀. M4 Air에서 열 스로틀링 가능성 가장 높음 — 배치 학습을 세션 나눠서 진행 권장 |

---

## 2. MobileNetV3 (Large) 학습 방법

**역할**: 경량/속도 기준선. 파이프라인 전체(크롭→학습→평가)가 제대로 도는지 제일 먼저 검증하는 용도로도 사용.

| 항목 | 값 |
|---|---|
| 소스 | `torchvision.models.mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.IMAGENET1K_V2)` |
| 파라미터 수 | 약 5.4M |
| Freeze 단계 | 1~2 epoch: feature extractor 전체 freeze / classifier head만 학습 |
| Unfreeze 단계 | 3 epoch~: 마지막 3개 block부터 순차 unfreeze |
| 학습률 | head: 5e-4 / 백본: 5e-5 (unfreeze 이후) |
| Epoch | 최대 25 |
| 배치 크기 | 64 (가벼워서 더 크게 가능) |
| 예상 특징 | 셋 중 제일 빠르게 학습·추론됨. 데이터 적을 때 오버피팅 위험도 가장 낮음. 최종적으로 모바일/서버 추론 지연시간이 중요하면 실사용 후보 1순위 |

---

## 3. EfficientNet-B0 학습 방법

**역할**: 정확도-효율 균형점. B0로 시작 (B7 등 큰 변형은 지금 데이터 규모에 과함 — 오버피팅 위험).

| 항목 | 값 |
|---|---|
| 소스 | `torchvision.models.efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1)` |
| 파라미터 수 | 약 5.3M |
| Freeze 단계 | 1~2 epoch: `features` 전체 freeze / classifier head만 학습 |
| Unfreeze 단계 | 3 epoch~: 마지막 2개 MBConv 블록부터 순차 unfreeze |
| 학습률 | head: 4e-4 / 백본: 4e-5 (unfreeze 이후) |
| Epoch | 최대 25 |
| 배치 크기 | 48 |
| 예상 특징 | ResNet50과 비슷한 정확도를 더 적은 파라미터로 낼 가능성. compound scaling 덕에 해상도 키우면(B1, B2) 성능 더 오를 수 있으나, 지금 단계는 224 고정으로 공정 비교 먼저 |

---

## 4. 비교실험 결과 리포트 형식 (제안)

```
| 부위 | 컨디션 | 태스크 | ResNet50 | MobileNetV3 | EfficientNet-B0 |
|------|--------|--------|----------|-------------|------------------|
| 이마 | 주름 | 분류(macro-F1) | 0.xx | 0.xx | 0.xx |
| 이마 | 수분/탄력 | 회귀(MAE) | x.x | x.x | x.x |
| ... | ... | ... | ... | ... | ... |
| 전체 macro 평균 | | | 0.xx | 0.xx | 0.xx |
| 평균 추론 시간(ms) | | | xx | xx | xx |
```

정확도(macro-F1/MAE)뿐 아니라 **추론 시간**도 같이 재야 한다 — 실제 서비스에선 사용자가 사진 찍고 결과를 기다리는 시간이라 지연시간도 선택 기준에 들어간다.

---

## 5. 최종 추론 구조 (Input → Inference → Output)

### 5.1 입력

```
사용자가 촬영한 얼굴 사진 1장 (정면)
```

### 5.2 추론 파이프라인

```
사진 1장
  ↓ MediaPipe Face Mesh (468 랜드마크)
  ↓ 랜드마크 → 바운딩박스 계산
9개 크롭: 이마, 미간, 좌눈가, 우눈가, 좌볼, 우볼, 입술, 턱, 전체얼굴
  ↓ 좌우 쌍은 같은 모델에 배치로 투입, 결과는 평균/worst-case로 병합
11개 모델 병렬 추론 (그림 기준 분류 6개 + 회귀 5개)
  ↓
부위별 원시 출력 수집
  ↓ 부위별 병합 규칙 적용 (아래 5.3)
SkinScoreSnapshot 형태로 구조화
```

### 5.3 부위별 출력 병합 규칙

- 한 부위에 컨디션이 여러 개(예: 이마=주름+색소침착)면 **더 나쁜 등급을 대표 grade로** 채택
- `moisture`/`elasticity`는 해당 부위의 회귀 head 값을 그대로 사용 (반올림 정수화)
- `overallScore`는 6개 부위 grade를 점수화(양호=90, 보통=65, 심함=40 등 매핑)해서 평균 — 매핑 기준값은 실제 라벨 분포 보고 다시 조정 필요

### 5.4 최종 출력 (앱 타입과 1:1 대응)

```json
{
  "id": "snap-...",
  "capturedAt": "2026-08-04T...",
  "overallScore": 68,
  "parts": [
    { "part": "forehead", "label": "이마", "grade": "심함", "moisture": 58, "elasticity": 65 },
    { "part": "glabella", "label": "미간", "grade": "보통" },
    { "part": "eyeArea",  "label": "눈가", "grade": "보통" },
    { "part": "cheek",    "label": "볼",   "grade": "심함", "moisture": 71, "elasticity": 68 },
    { "part": "lips",     "label": "입술", "grade": "건조" },
    { "part": "jaw",      "label": "턱",   "grade": "양호", "moisture": 66, "elasticity": 71 }
  ]
}
```

이 JSON 구조는 지금 `src/types/index.ts`의 `SkinScoreSnapshot`/`SkinPartMetric`과 이미 동일하다. 즉 이 모델의 추론 서버가 완성되면, NestJS 백엔드의 `InferenceProvider` 인터페이스(`MockInferenceProvider`를 대체할 `PythonInferenceProvider`)가 이 JSON을 그대로 반환하도록 연결하면 되고, 프론트/타입 쪽은 변경이 필요 없다.

---

## 6. 아직 확정 안 된 것 (진행하면서 결정 필요)

- [ ] `overallScore` 산출 공식 (등급→점수 매핑값)
- [ ] 좌/우 눈가·볼을 평균으로 합칠지, 더 나쁜 쪽(worst-case)으로 합칠지
- [ ] 회귀1(전체얼굴 ResNet)의 정확한 출력 정의 — 다이어그램상 용도가 아직 불명확
- [ ] 부위별 등급 클래스 수(3단계 고정인지, 부위마다 다를 수 있는지)
