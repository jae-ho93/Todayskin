# Todayskin Inference Service

학습된 MobileNetV3-Large 모델(`skin-analysis-pipeline` 파이프라인 산출물)을 감싼
내부 전용 FastAPI 서버. NestJS 백엔드의 `PythonInferenceProvider`가 이 서버를
HTTP로 호출한다.

업로드된 사진은 메모리에서만 디코딩·정규화·크롭되고 디스크에 저장되지 않는다.
응답은 구조화된 진단 결과(점수/등급/수분/탄력)뿐이며, NestJS는 이 결과만 DB에 저장한다.

## 구성

- `main.py` — FastAPI 앱 (`GET /health`, `POST /infer`)
- `analyzer.py` — 원본 파이프라인의 `src/infer.py`를 이미지 바이트 입력 기준으로 이식
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

## 확인

```bash
curl http://127.0.0.1:8000/health

curl -X POST http://127.0.0.1:8000/infer \
  -F "front=@/path/to/face.jpg;type=image/jpeg"
```
