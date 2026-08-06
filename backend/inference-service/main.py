"""Todayskin skin-analysis inference service.

Internal-only HTTP wrapper around the trained MobileNetV3 model
(analyzer.SkinAnalyzer) for the NestJS backend's PythonInferenceProvider.

The uploaded photo is decoded and cropped fully in memory and never written
to disk -- only the structured diagnosis result (scores/grades) is returned,
which is all the NestJS backend persists.
"""
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from analyzer import NoFaceDetected, SkinAnalyzer
from part_mapping import map_to_app_schema

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inference-service")

analyzer: SkinAnalyzer | None = None
# mediapipe의 FaceLandmarker/torch 모델 인스턴스를 요청 간 공유하므로, 동시 요청이
# 같은 인스턴스에 병렬 접근하지 않도록 추론 구간을 직렬화한다.
inference_lock = threading.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global analyzer
    logger.info("Loading SkinAnalyzer (model + face landmarker)...")
    analyzer = SkinAnalyzer()
    logger.info("SkinAnalyzer ready.")
    yield
    analyzer.close()


app = FastAPI(title="Todayskin Inference Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/infer")
async def infer(front: UploadFile = File(...)):
    image_bytes = await front.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="빈 이미지입니다")

    def run_analysis():
        with inference_lock:
            return analyzer.analyze(image_bytes)

    try:
        # torch/mediapipe 추론은 동기·CPU 바운드라 이벤트 루프를 막지 않도록 threadpool에서 실행한다.
        analysis = await run_in_threadpool(run_analysis)
    except NoFaceDetected:
        raise HTTPException(status_code=422, detail="이미지에서 얼굴을 인식할 수 없습니다")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Inference failed")
        raise HTTPException(status_code=500, detail="추론 처리 중 오류가 발생했습니다")

    return map_to_app_schema(analysis, analyzer.model_version)
