import { Injectable, Logger } from '@nestjs/common';
import {
  InferenceImages,
  InferenceProvider,
  InferenceResult,
  InferredPartMetric,
} from './inference-provider.interface';

/**
 * PythonInferenceProvider — backend/inference-service(FastAPI + 학습된 MobileNetV3)를
 * HTTP로 호출하는 실제 추론 provider.
 *
 * 이미지 버퍼는 요청 body로만 전달하고 NestJS 쪽에서 별도로 저장하지 않는다
 * (원본 이미지 비저장 원칙). 응답은 InferenceResult 계약(overallScore/modelVersion/parts)과
 * 1:1 대응하도록 inference-service의 part_mapping.py가 이미 맞춰서 반환한다.
 *
 * N13: 내부망 전용 인증 — INFERENCE_SHARED_SECRET을 X-Inference-Key 헤더로 보낸다.
 * inference-service는 같은 값이 아니면 401, secret 미설정이면 503으로 거부한다.
 *
 * R6: 추론 슬롯이 모두 사용 중이면 inference-service가 대기 상한을 넘긴 요청을
 * 429로 거부한다. 클라이언트 타임아웃까지 붙잡히지 않으므로 짧게 한 번 재시도하고,
 * 그래도 혼잡하면 InferenceBusyError로 구분해 던진다.
 */

/** R6: 추론 서버 혼잡(429). 재시도 후에도 슬롯을 얻지 못한 경우. */
export class InferenceBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InferenceBusyError';
  }
}

/** 429 재시도 대기 상한 — 클라이언트 타임아웃(30s) 예산을 넘기지 않게 짧게 잡는다. */
const MAX_RETRY_DELAY_MS = 2000;

@Injectable()
export class PythonInferenceProvider implements InferenceProvider {
  private readonly logger = new Logger(PythonInferenceProvider.name);

  constructor(
    private readonly baseUrl: string,
    private readonly sharedSecret: string,
  ) {}

  async infer(images: InferenceImages): Promise<InferenceResult> {
    // N13: shared secret 헤더. 미설정(빈 문자열)이면 헤더를 생략하고,
    // inference-service가 401/503으로 거부하게 둔다.
    const headers: Record<string, string> = {};
    if (this.sharedSecret) {
      headers['x-inference-key'] = this.sharedSecret;
    }

    let res = await this.post(images, headers);

    // R6: 혼잡(429)은 일시적이므로 Retry-After만큼 기다렸다가 한 번만 재시도한다.
    if (res.status === 429) {
      const delayMs = this.retryDelayMs(res.headers.get('retry-after'));
      this.logger.warn(
        `Inference service busy (429) — retrying once in ${delayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      res = await this.post(images, headers);
      if (res.status === 429) {
        throw new InferenceBusyError(
          'Inference service is saturated (HTTP 429 after retry)',
        );
      }
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.warn(`Inference service returned HTTP ${res.status}: ${detail}`);
      throw new Error(`Inference service returned HTTP ${res.status}: ${detail}`);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(
        `Inference service response parse failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return this.toInferenceResult(data);
  }

  /** 이미지 버퍼는 요청마다 새 FormData로 만든다(재시도 시 body 재사용 불가). */
  private async post(
    images: InferenceImages,
    headers: Record<string, string>,
  ): Promise<Response> {
    const formData = new FormData();
    formData.append(
      'front',
      new Blob([new Uint8Array(images.front.buffer)], { type: images.front.mimetype }),
      'front.jpg',
    );

    try {
      return await fetch(`${this.baseUrl}/infer`, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Inference service request failed: ${message}`);
      throw new Error(`Inference service request failed: ${message}`);
    }
  }

  private retryDelayMs(retryAfter: string | null): number {
    const seconds = Number(retryAfter);
    if (!Number.isFinite(seconds) || seconds <= 0) return 500;
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }

  private toInferenceResult(data: unknown): InferenceResult {
    const d = data as {
      overallScore?: unknown;
      modelVersion?: unknown;
      parts?: unknown;
      landmarks?: unknown;
      acneReport?: unknown;
      diseaseClassification?: unknown;
    };
    if (
      typeof d.overallScore !== 'number' ||
      typeof d.modelVersion !== 'string' ||
      !Array.isArray(d.parts)
    ) {
      throw new Error('Unexpected inference service response shape');
    }
    return {
      overallScore: d.overallScore,
      modelVersion: d.modelVersion,
      parts: d.parts as InferredPartMetric[],
      landmarks: parseLandmarks(d.landmarks),
      acneReport: parseAcneReport(d.acneReport),
      diseaseClassification: parseDiseaseClassification(d.diseaseClassification),
    };
  }
}

function parseAcneReport(raw: unknown): InferenceResult['acneReport'] {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function parseDiseaseClassification(raw: unknown): InferenceResult['diseaseClassification'] {
  if (!raw || typeof raw !== 'object') return null;
  const dc = raw as { label?: unknown; confidence?: unknown };
  if (typeof dc.label !== 'string' || typeof dc.confidence !== 'number') return null;
  return { label: dc.label, confidence: dc.confidence };
}

function parseLandmarks(raw: unknown): InferenceResult['landmarks'] {
  if (!raw || typeof raw !== 'object') return null;
  const lm = raw as { version?: unknown; points?: unknown };
  if (typeof lm.version !== 'string' || !Array.isArray(lm.points)) return null;
  const points: number[][] = [];
  for (const p of lm.points) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push([x, y]);
  }
  if (points.length === 0) return null;
  return { version: lm.version, points };
}
