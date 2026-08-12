"""Todayskin skin-analysis inference service.

Internal-only HTTP wrapper around the trained MobileNetV3 model
(analyzer.SkinAnalyzer) for the NestJS backend's PythonInferenceProvider.

The uploaded photo is decoded and cropped fully in memory and never written
to disk -- only the structured diagnosis result (scores/grades) is returned,
which is all the NestJS backend persists.

N13 internal boundary hardening:
- ``/infer``와 ``/metrics``는 shared secret(INFERENCE_SHARED_SECRET)을
  ``X-Inference-Key`` 헤더로 요구한다. secret이 미설정이면 fail-closed(503)로
  동작해 익명 트래픽을 받지 않는다. ``/health``만 무인증(ECS 헬스체크용)이다.
- upload content-type and size are capped to match the NestJS contract
  (jpeg/png/webp, 10MB) before any model work.
- slot wait / execution time, in-flight concurrency and status counters are
  exported via ``GET /metrics`` (Prometheus text).
- a wall-clock inference timeout returns 503 (kept shorter than the NestJS
  client timeout so the client sees an explicit 503, not a client abort).

R6 동시성: 모델 인스턴스는 스레드 안전하지 않으므로 전역 락 대신
``INFERENCE_CONCURRENCY``개의 인스턴스 풀 + 세마포어로 동시 처리 수를 제어한다.
슬롯 대기가 ``INFERENCE_QUEUE_TIMEOUT_SECONDS``를 넘으면 429를 반환해 NestJS가
클라이언트 타임아웃을 기다리지 않고 즉시 fallback할 수 있게 한다. 기본값 1은
기존 동작(컨테이너당 동시 1건)과 동일하며, 올릴 때는 vCPU·메모리를 함께 키워야
한다(인스턴스마다 모델을 메모리에 올린다).
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
import time
from contextlib import asynccontextmanager
from queue import LifoQueue
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
# 슬롯 대기 상한. 초과 시 429 — NestJS가 즉시 fallback한다.
DEFAULT_QUEUE_TIMEOUT_SECONDS = 5.0
DEFAULT_CONCURRENCY = 1
MAX_CONCURRENCY = 4
AUTH_HEADER = "x-inference-key"

# 대표 인스턴스 — model_version 조회와 준비 상태(readiness) 판정에 쓴다.
analyzer: SkinAnalyzer | None = None
# 추론 슬롯. 세마포어가 동시 실행 수를, 풀이 인스턴스 소유권을 보장한다.
# (mediapipe FaceLandmarker/torch 모델은 인스턴스 공유 시 스레드 안전하지 않다.)
analyzer_pool: LifoQueue | None = None
inference_slots: asyncio.Semaphore | None = None
metrics = Metrics()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global analyzer, analyzer_pool, inference_slots
    concurrency = _inference_concurrency()
    logger.info("Loading SkinAnalyzer x%d (model + face landmarker)...", concurrency)
    if concurrency > 1:
        _pin_torch_threads()
    instances = [SkinAnalyzer() for _ in range(concurrency)]
    pool: LifoQueue = LifoQueue()
    for instance in instances:
        pool.put(instance)
    analyzer = instances[0]
    analyzer_pool = pool
    inference_slots = asyncio.Semaphore(concurrency)
    metrics.set_concurrency_limit(concurrency)
    logger.info("SkinAnalyzer ready (concurrency=%d).", concurrency)
    try:
        yield
    finally:
        analyzer = None
        analyzer_pool = None
        inference_slots = None
        for instance in instances:
            instance.close()


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
    """ECS 컨테이너 헬스체크용 — 유일한 무인증 endpoint.

    모델이 준비되지 않은 상태(startup 실패 등)를 ok로 보고하지 않는다.
    민감정보를 담지 않기 위해 상태 문자열만 반환한다.
    """
    if analyzer is None or analyzer_pool is None or inference_slots is None:
        raise HTTPException(status_code=503, detail="추론 모델이 준비되지 않았습니다")
    return {"status": "ok"}


@app.get("/metrics", dependencies=[Depends(require_internal_key)])
def metrics_endpoint() -> PlainTextResponse:
    """R32: 운영 지표도 내부 인증을 요구한다 (스크레이퍼는 같은 헤더를 보낸다)."""
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

        # 3. 추론 슬롯 확보 — 대기 시간과 실행 시간을 분리 측정한다.
        #    대기가 상한을 넘으면 429로 즉시 거부해 NestJS가 클라이언트 타임아웃까지
        #    붙잡히지 않고 fallback할 수 있게 한다.
        if analyzer_pool is None or inference_slots is None:
            raise HTTPException(status_code=503, detail="추론 모델이 준비되지 않았습니다")

        start_wait = time.monotonic()
        try:
            await asyncio.wait_for(
                inference_slots.acquire(), timeout=_queue_timeout_seconds()
            )
        except asyncio.TimeoutError:
            metrics.observe_queue_wait(time.monotonic() - start_wait)
            metrics.inc_queue_timeout()
            raise HTTPException(
                status_code=429,
                detail="추론 서버가 혼잡합니다. 잠시 후 다시 시도해주세요",
                headers={"Retry-After": "1"},
            )
        metrics.observe_queue_wait(time.monotonic() - start_wait)

        # 세마포어가 슬롯 수를 보장하므로 풀에서 즉시 인스턴스를 얻는다.
        instance: SkinAnalyzer = analyzer_pool.get_nowait()
        start_exec = time.monotonic()
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(None, run_analysis, instance, image_bytes)
        timed_out = False
        try:
            analysis = await asyncio.wait_for(
                asyncio.shield(future), timeout=_inference_timeout_seconds()
            )
        except asyncio.TimeoutError:
            timed_out = True
            # 인스턴스를 풀에 돌려주기 전에 백그라운드 추론 완료를 기다린다 —
            # 다른 요청이 같은 인스턴스를 병렬로 쓰지 않게 한다. 완료 시점의 예외는
            # 이미 503(타임아웃)으로 응답할 예정이므로 무시한다.
            try:
                await future
            except Exception:
                pass
        finally:
            metrics.observe_execution(time.monotonic() - start_exec)
            analyzer_pool.put(instance)
            inference_slots.release()

        if timed_out:
            raise HTTPException(status_code=503, detail="추론 시간이 초과되었습니다")

        return map_to_app_schema(analysis, instance.model_version)
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


def run_analysis(instance: SkinAnalyzer, image_bytes: bytes):
    """torch/mediapipe 추론은 동기·CPU 바운드라 이벤트 루프를 막지 않도록
    executor 스레드에서 실행한다. 인스턴스 소유권은 호출부(infer)가 관리한다."""
    return instance.analyze(image_bytes)


def _inference_timeout_seconds() -> float:
    """요청 시점에 읽어 테스트에서 monkeypatch할 수 있게 한다."""
    return float(os.environ.get("INFERENCE_TIMEOUT_SECONDS", str(DEFAULT_INFERENCE_TIMEOUT_SECONDS)))


def _queue_timeout_seconds() -> float:
    """슬롯 대기 상한. 요청 시점에 읽어 테스트에서 monkeypatch할 수 있게 한다."""
    return float(os.environ.get("INFERENCE_QUEUE_TIMEOUT_SECONDS", str(DEFAULT_QUEUE_TIMEOUT_SECONDS)))


def _inference_concurrency() -> int:
    """동시 추론 슬롯 수. 인스턴스마다 모델을 메모리에 올리므로 상한을 둔다."""
    raw = os.environ.get("INFERENCE_CONCURRENCY", str(DEFAULT_CONCURRENCY))
    try:
        value = int(raw)
    except ValueError:
        logger.warning("INFERENCE_CONCURRENCY 값이 올바르지 않습니다 — 기본값을 사용합니다")
        return DEFAULT_CONCURRENCY
    return max(1, min(MAX_CONCURRENCY, value))


def _pin_torch_threads() -> None:
    """병렬 추론 시 인스턴스마다 BLAS 스레드를 1개로 고정한다.

    고정하지 않으면 인스턴스 수 × 코어 수만큼 스레드가 생겨 컨텍스트 스위칭으로
    오히려 느려진다. torch import는 테스트 stub 환경에 없을 수 있어 방어한다.
    """
    try:
        import torch

        torch.set_num_threads(1)
    except Exception:  # pragma: no cover - torch 미설치(테스트 stub) 환경
        logger.warning("torch.set_num_threads를 적용하지 못했습니다")


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
