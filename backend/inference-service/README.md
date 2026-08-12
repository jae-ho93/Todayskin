# Todayskin Inference Service

학습된 MobileNetV3-Large 모델(`skin-analysis-pipeline` 파이프라인 산출물)을 감싼
내부 전용 FastAPI 서버. NestJS 백엔드의 `PythonInferenceProvider`가 이 서버를
HTTP로 호출한다.

업로드된 사진은 메모리에서만 디코딩·정규화·크롭되고 디스크에 저장되지 않는다.
응답은 구조화된 진단 결과(점수/등급/수분/탄력)와 정규화된 MediaPipe landmarks이며, NestJS는 저장 동의가 있을 때만 landmarks를 DB에 보존한다.

## 구성

- `main.py` — FastAPI 앱 (`GET /health`, `GET /metrics`, `POST /infer`)
- `analyzer.py` — 원본 파이프라인의 `src/infer.py`를 이미지 바이트 입력 기준으로 이식하고 landmarks를 응답에 포함
- `crop.py`, `landmarks.py`, `model.py`, `backbones.py`, `normalize.py`, `regions.py`, `scoring.py`
  — 원본 파이프라인(`skin-analysis-pipeline/src/`)에서 그대로 가져온 전처리·모델 정의
- `part_mapping.py` — 모델의 8개 부위(얼굴 전체 제외) 출력을 앱의 6개 부위 스키마로 매핑
  (좌/우 눈가 → `eyeArea`, 좌/우 볼 → `cheek` 평균, 나머지는 1:1)
- `assets/` — `best.pt`(모델 가중치), `face_landmarker.task`(MediaPipe), `templates.json`,
  `reg_stats.json`, `args.json` — 학습 파이프라인 산출물 복사본

## 실행

의존성은 모델을 학습한 Python 환경에 이미 설치되어 있다는 전제. 별도 환경이면:

```bash
cd backend/inference-service
pip install -r requirements.txt
```

서버 실행:

```bash
cd backend/inference-service
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Docker (N5):

```bash
cd backend
docker compose --profile inference up -d --build
# 또는 NestJS와 함께: docker compose --profile backend up -d --build
```

NestJS 쪽은 `backend/.env`의 `INFERENCE_SERVICE_URL=http://127.0.0.1:8000`,
`MOCK_INFERENCE=false`로 이 서버를 가리키도록 설정한다.
compose 통합 시 URL은 `http://inference:8000`이다.

## 동시성 (R6)

모델 인스턴스(torch + MediaPipe FaceLandmarker)는 스레드 안전하지 않으므로,
`INFERENCE_CONCURRENCY`개의 인스턴스 풀과 세마포어로 동시 처리 수를 제어한다.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `INFERENCE_CONCURRENCY` | `1` | 동시 추론 슬롯 수 (1~4). 인스턴스마다 모델을 메모리에 올린다 |
| `INFERENCE_QUEUE_TIMEOUT_SECONDS` | `5` | 슬롯 대기 상한. 초과 시 `429 + Retry-After` |
| `INFERENCE_TIMEOUT_SECONDS` | `25` | 추론 실행 상한. 초과 시 `503` |

1을 넘기려면 ECS task의 cpu/memory를 함께 키우고 부하 테스트로 확인해야 한다
(메모리 초과로 OOMKill이 나면 오히려 가용성이 나빠진다). 429는 NestJS
`PythonInferenceProvider`가 한 번만 짧게 재시도하고, 그래도 혼잡하면
`InferenceBusyError`로 실패한다.

## 품질 게이트 (N49)

어둡거나 흔들리거나 너무 작은 사진은 모델이 점수를 내더라도 신뢰할 수 없다.
추론 슬롯을 잡기 전에 `422 + {code, message}`로 거부하고, 앱이 코드별
재촬영 안내를 띄운다(F78). 코드: `TOO_SMALL` / `TOO_DARK` / `BLURRY`
(+ 얼굴 미인식 `NO_FACE`).

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `QUALITY_MIN_EDGE_PX` | `480` | 짧은 변 최소 픽셀. 미만이면 `TOO_SMALL` |
| `QUALITY_MIN_MEAN_LUMA` | `55` | 그레이스케일 평균 휘도(0~255) 하한. 미만이면 `TOO_DARK` |
| `QUALITY_MIN_LAPLACIAN_VAR` | `40` | 라플라시안 분산 하한(장변 640px 정규화 후). 미만이면 `BLURRY` |

값을 `0`으로 두면 해당 검사를 끈다. 기본값은 보수적이다 — 데모에서 정상
사진을 오탐으로 거부하는 것이 미검출보다 나쁘기 때문이다.

## 인증 (N13/R32)

`/infer`와 `/metrics`는 `X-Inference-Key: {INFERENCE_SHARED_SECRET}`을 요구한다.
secret 미설정이면 fail-closed(503). `/health`만 무인증(ECS 컨테이너 헬스체크용)이며,
모델이 준비되지 않으면 503을 반환한다.

## 확인

```bash
curl http://127.0.0.1:8000/health

curl -H "X-Inference-Key: $INFERENCE_SHARED_SECRET" http://127.0.0.1:8000/metrics

curl -X POST http://127.0.0.1:8000/infer \
  -H "X-Inference-Key: $INFERENCE_SHARED_SECRET" \
  -F "front=@/path/to/face.jpg;type=image/jpeg"
```

## 테스트

계약 테스트는 `analyzer`/`part_mapping`을 stub하므로 torch/mediapipe 없이 돌아간다
(CI의 `inference-contract-test` job과 동일):

```bash
cd backend/inference-service
pip install -r requirements-dev.txt
python -m pytest tests/ -q
```

`POST /infer`는 `overallScore`, `modelVersion`, 앱의 6개 `parts`, 선택적 `landmarks`를 반환한다. 인증·동의·저장 판단은 이 서비스가 아니라 NestJS가 담당한다.
