import { Injectable } from '@nestjs/common';
import {
  InferenceImages,
  InferenceProvider,
  InferenceResult,
} from './inference-provider.interface';

/**
 * MockInferenceProvider — 개발/통합 테스트용 고정 추론값.
 *
 * 실제 Python AI 서버 추론은 모델 학습 완료 후 PythonInferenceProvider로 교체한다.
 * 이 Provider는 환경 변수(MOCK_INFERENCE=true)가 설정된 경우에만 활성화되며,
 * 운영 환경에서는 사용하지 않는다(운영 mock fallback 비활성화 테스트로 검증).
 *
 * 기존 FastAPI mock_data.MOCK_SKIN_SCORE와 동일한 6개 부위 값을 반환해
 * 기존 프론트 API 계약을 유지한다.
 */
@Injectable()
export class MockInferenceProvider implements InferenceProvider {
  private static readonly MODEL_VERSION = 'mock-v0.1.0';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async infer(images: InferenceImages): Promise<InferenceResult> {
    // 입력 버퍼는 사용 후 별도 참조를 유지하지 않는다(원본 이미지 비저장 원칙).
    // 호출 즉시 결과만 반환하고 버퍼는 GC 대상이 되도록 둔다.
    return {
      overallScore: 78,
      modelVersion: MockInferenceProvider.MODEL_VERSION,
      parts: [
        { part: 'forehead', label: '이마', grade: '양호', moisture: 72, elasticity: 68, note: null },
        { part: 'glabella', label: '미간', grade: '보통', moisture: 60, elasticity: 64, note: null },
        { part: 'eyeArea', label: '눈가', grade: '보통', moisture: 55, elasticity: 58, note: null },
        { part: 'cheek', label: '볼', grade: '양호', moisture: 75, elasticity: 70, note: null },
        { part: 'lips', label: '입술', grade: '건조', moisture: 40, elasticity: null, note: null },
        { part: 'jaw', label: '턱', grade: '양호', moisture: 66, elasticity: 71, note: null },
      ],
    };
  }
}
