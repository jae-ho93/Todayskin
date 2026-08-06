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
 */
@Injectable()
export class PythonInferenceProvider implements InferenceProvider {
  private readonly logger = new Logger(PythonInferenceProvider.name);

  constructor(private readonly baseUrl: string) {}

  async infer(images: InferenceImages): Promise<InferenceResult> {
    const formData = new FormData();
    formData.append(
      'front',
      new Blob([new Uint8Array(images.front.buffer)], { type: images.front.mimetype }),
      'front.jpg',
    );

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/infer`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Inference service request failed: ${message}`);
      throw new Error(`Inference service request failed: ${message}`);
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

  private toInferenceResult(data: unknown): InferenceResult {
    const d = data as {
      overallScore?: unknown;
      modelVersion?: unknown;
      parts?: unknown;
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
    };
  }
}
