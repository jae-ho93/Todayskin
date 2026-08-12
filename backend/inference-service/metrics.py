"""Minimal in-process Prometheus-text metrics for the inference service (N13).

Deliberately dependency-free (no prometheus-client) to keep the runtime image
small. Exported via GET /metrics in Prometheus text exposition format
(content-type: text/plain; version=0.0.4).
"""
from __future__ import annotations

import threading
from typing import Dict, List


class _Histogram:
    """Fixed-bucket histogram (le buckets + +Inf). Not thread-safe by itself;
    callers (Metrics) hold a lock around observe/render."""

    def __init__(self, name: str, help_text: str, buckets: List[float]) -> None:
        self.name = name
        self.help_text = help_text
        self.buckets = sorted(buckets)
        self.counts: List[int] = [0] * (len(buckets) + 1)
        self.sum = 0.0
        self.count = 0

    def observe(self, value: float) -> None:
        self.sum += value
        self.count += 1
        for i, bound in enumerate(self.buckets):
            if value <= bound:
                self.counts[i] += 1
                return
        self.counts[-1] += 1

    def render(self) -> List[str]:
        lines = [
            f"# HELP {self.name} {self.help_text}",
            f"# TYPE {self.name} histogram",
        ]
        for i, bound in enumerate(self.buckets):
            lines.append(f'{self.name}_bucket{{le="{bound:g}"}} {self.counts[i]}')
        lines.append(f'{self.name}_bucket{{le="+Inf"}} {self.counts[-1]}')
        lines.append(f"{self.name}_sum {self.sum:g}")
        lines.append(f"{self.name}_count {self.count}")
        return lines


class Metrics:
    """Thread-safe collection of counters/gauges/histograms for /infer.

    - inference_requests_total{status}: HTTP status별 요청 수
    - inference_in_flight: 현재 실행 중(추론 포함) 요청 수
    - inference_queue_wait_seconds: 추론 슬롯 대기 시간
    - inference_execution_seconds: 모델 추론 실행 시간 (슬롯 점유 중)
    - inference_queue_timeouts_total: 슬롯 대기 타임아웃으로 429 거부된 요청 수
    - inference_concurrency_limit: 동시 추론 슬롯 수 (INFERENCE_CONCURRENCY)
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._requests: Dict[str, int] = {}
        self._in_flight = 0
        self._queue_timeouts = 0
        self._concurrency_limit = 0
        self.queue_wait = _Histogram(
            "inference_queue_wait_seconds",
            "Seconds spent waiting for a free inference slot before execution starts",
            [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
        )
        self.execution = _Histogram(
            "inference_execution_seconds",
            "Seconds spent running the model inference while holding a slot",
            [0.1, 0.5, 1, 2, 5, 10, 20, 30],
        )

    # ── counters / gauges ────────────────────────────────────────────────

    def inc_request(self, status: str) -> None:
        with self._lock:
            self._requests[status] = self._requests.get(status, 0) + 1

    def inc_in_flight(self) -> None:
        with self._lock:
            self._in_flight += 1

    def dec_in_flight(self) -> None:
        with self._lock:
            self._in_flight -= 1

    def inc_queue_timeout(self) -> None:
        with self._lock:
            self._queue_timeouts += 1

    def set_concurrency_limit(self, limit: int) -> None:
        with self._lock:
            self._concurrency_limit = limit

    # ── histograms ───────────────────────────────────────────────────────

    def observe_queue_wait(self, value: float) -> None:
        with self._lock:
            self.queue_wait.observe(value)

    def observe_execution(self, value: float) -> None:
        with self._lock:
            self.execution.observe(value)

    # ── render ───────────────────────────────────────────────────────────

    def render(self) -> str:
        with self._lock:
            requests = dict(self._requests)
            in_flight = self._in_flight
            queue_timeouts = self._queue_timeouts
            concurrency_limit = self._concurrency_limit
            queue_wait_lines = self.queue_wait.render()
            execution_lines = self.execution.render()

        lines: List[str] = [
            "# HELP inference_requests_total Inference requests by HTTP status",
            "# TYPE inference_requests_total counter",
        ]
        for status in sorted(requests):
            lines.append(f'inference_requests_total{{status="{status}"}} {requests[status]}')
        lines.append("# HELP inference_in_flight Inference requests currently executing")
        lines.append("# TYPE inference_in_flight gauge")
        lines.append(f"inference_in_flight {in_flight}")
        lines.append(
            "# HELP inference_queue_timeouts_total Requests rejected with 429 after waiting for a slot"
        )
        lines.append("# TYPE inference_queue_timeouts_total counter")
        lines.append(f"inference_queue_timeouts_total {queue_timeouts}")
        lines.append("# HELP inference_concurrency_limit Configured concurrent inference slots")
        lines.append("# TYPE inference_concurrency_limit gauge")
        lines.append(f"inference_concurrency_limit {concurrency_limit}")
        lines.extend(queue_wait_lines)
        lines.extend(execution_lines)
        return "\n".join(lines) + "\n"
