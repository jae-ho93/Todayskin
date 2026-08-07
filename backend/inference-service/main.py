"""Todayskin skin-analysis inference service.

Internal-only HTTP wrapper around the trained MobileNetV3 model
(analyzer.SkinAnalyzer) for the NestJS backend's PythonInferenceProvider.

The uploaded photo is decoded and cropped fully in memory and never written
to disk -- only the structured diagnosis result (scores/grades) is returned,
which is all the NestJS backend persists.

N13 internal boundary hardening:
- ``/infer`` requires the shared secret (INFERENCE_SHARED_SECRET) via the
  ``X-Inference-Key`` header. If the secret is not configured the endpoint
  fails closed (503) instead of accepting anonymous traffic.
- upload content-type and size are capped to match the NestJS contract
  (jpeg/png/webp, 10MB) before any model work.
- lock wait / execution time, in-flight concurrency and status counters are
  exported via ``GET /metrics`` (Prometheus text).
- a wall-clock inference timeout returns 503 (kept shorter than the NestJS
  client timeout so the client sees an explicit 503, not a client abort).
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
import threading
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from starlette.responses import PlainTextResponse

from analyzer import NoFaceDetected, SkinAnalyzer
from metrics import Metrics
from part_mapping import map_to_app_schema

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inference-service")

# N13: NestJS diagnosis.service.ts의 MAX_FILE_BYTES/ALLOWED_MIME와 동일한 상한.
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
# NestJS PythonInferenceProvider의 클라이언트 타임아웃(30s)보다 짧게 유지해
# 503(추론 초과)이 클라이언트 타임아웃보다 먼저 명확하게 오도록 한다.
DEFAULT_INFERENCE_TIMEOUT_SECONDS = 25.0
AUTH_HEADER = "x-inference-key"

analyzer: SkinAnalyzer | None = None
# mediapipe의 FaceLandmarker/torch 모델 인스턴스를 요청 간 공유하므로, 동시 요청이
# 같은 인스턴스에 병렬 접근하지 않도록 추론 구간을 직렬화한다.
inference_lock = threading.Lock()
metrics = Metrics()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global analyzer
    logger.info("Loading SkinAnalyzer (model + face landmarker)...")
    analyzer = SkinAnalyzer()
    logger.info("SkinAnalyzer ready.")
    yield
    analyzer.close()


app = FastAPI(title="Todayskin Inference Service", lifespan=lifespan)


async def require_internal_key(
    x_inference_key: Optional[str] = Header(default=None),
) -> None:
    """N13: 내부망 전용 인증.

    NestJS PythonInferenceProvider가 같은 값을 X-Inference-Key로 보낸다.
    INFERENCE_SHARED_SECRET이 미설정이면 fail-closed(503)로 동작해, 오배치나
    직접 호출에도 무제한 이미지 처리 endpoint로 노출되지 않게 한다.
    """
    secret = os.environ.get("INFERENCE_SHARED_SECRET", "")
    if not secret:
        # endpoint 본문이 실행되지 않으므로 여기서 직접 지표에 기록한다.
        metrics.inc_request("503")
        raise HTTPException(
            status_code=503,
            detail="INFERENCE_SHARED_SECRET이 설정되지 않았습니다 (fail-closed)",
        )
    if not x_inference_key or not secrets.compare_digest(x_inference_key, secret):
        metrics.inc_request("401")
        raise HTTPException(
            status_code=401,
            detail="내부 인증 키가 올바르지 않습니다",
        )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/metrics")
def metrics_endpoint() -> PlainTextResponse:
    return PlainTextResponse(metrics.render())


@app.post("/infer", dependencies=[Depends(require_internal_key)])
async def infer(front: UploadFile = File(...)):
    status = "200"  # 정상 완료 기본값. 예외 경로에서만 다른 상태로 갱신된다.
    metrics.inc_in_flight()
    try:
        # 1. 콘텐츠 타입 상한 (NestJS ALLOWED_MIME와 동일).
        if front.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=415,
                detail="지원하지 않는 콘텐츠 타입입니다 (jpeg, png, webp만 가능)",
            )

        # 2. 크기 상한 (NestJS MAX_FILE_BYTES와 동일). 청크 단위로 읽어 상한을
        #    초과하면 전체를 메모리에 올리기 전에 413으로 거부한다.
        image_bytes = await read_limited(front, MAX_FILE_BYTES)
        if image_bytes is None:
            raise HTTPException(
                status_code=413,
                detail=f"이미지가 너무 큽니다 (최대 {MAX_FILE_BYTES // (1024 * 1024)}MB)",
            )
        if not image_bytes:
            raise HTTPException(status_code=400, detail="빈 이미지입니다")

        # 3. 추론 — lock 대기와 실행 시간을 분리 측정하고 총 실행에 timeout을 건다.
        #    타임아웃 시에도 백그라운드 추론이 끝날 때까지 lock을 유지해
        #    (await future) 모델 인스턴스의 동시 접근을 막는다.
        start_wait = time.monotonic()
        # 이벤트 루프를 막지 않도록 lock 획득은 worker 스레드에서 한다.
        # (burst 요청 동안 /health·/metrics 응답이 멈추는 것을 방지 — N13 리뷰 반영)
        await asyncio.to_thread(inference_lock.acquire)
        metrics.observe_queue_wait(time.monotonic() - start_wait)
        start_exec = time.monotonic()
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(None, run_analysis, image_bytes)
        timed_out = False
        try:
            analysis = await asyncio.wait_for(
                asyncio.shield(future), timeout=_inference_timeout_seconds()
            )
        except asyncio.TimeoutError:
            timed_out = True
            # lock 해제 전에 백그라운드 추론 완료를 기다린다. 완료 시점의 예외는
            # 이미 503(타임아웃)으로 응답할 예정이므로 무시한다.
            try:
                await future
            except Exception:
                pass
        finally:
            metrics.observe_execution(time.monotonic() - start_exec)
            inference_lock.release()

        if timed_out:
            raise HTTPException(status_code=503, detail="추론 시간이 초과되었습니다")

        return map_to_app_schema(analysis, analyzer.model_version)
    except HTTPException as e:
        status = str(e.status_code)
        raise
    except NoFaceDetected:
        status = "422"
        raise HTTPException(status_code=422, detail="이미지에서 얼굴을 인식할 수 없습니다")
    except ValueError as e:
        status = "400"
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        status = "500"
        logger.exception("Inference failed")
        raise HTTPException(status_code=500, detail="추론 처리 중 오류가 발생했습니다")
    finally:
        metrics.inc_request(status)
        metrics.dec_in_flight()


def run_analysis(image_bytes: bytes):
    """torch/mediapipe 추론은 동기·CPU 바운드라 이벤트 루프를 막지 않도록
    executor 스레드에서 실행한다. lock은 호출부(infer)가 관리한다."""
    return analyzer.analyze(image_bytes)


def _inference_timeout_seconds() -> float:
    """요청 시점에 읽어 테스트에서 monkeypatch할 수 있게 한다."""
    return float(os.environ.get("INFERENCE_TIMEOUT_SECONDS", str(DEFAULT_INFERENCE_TIMEOUT_SECONDS)))


async def read_limited(file: UploadFile, limit: int) -> bytes | None:
    """전체를 메모리에 올리지 않고 최대 limit+1바이트까지만 읽는다. 초과 시 None."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            return None
        chunks.append(chunk)
    return b"".join(chunks)
