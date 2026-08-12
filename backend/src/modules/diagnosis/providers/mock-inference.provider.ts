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
 * 이 Provider는 환경 변수(MOCK_INFERENCE=true)가 설정된 개발/테스트 환경에서만
 * 활성화된다. 설정이 없거나 false이면 Unavailable provider가 사용된다.
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
      // N8: 테스트용 축소 랜드마크(실제는 478점). 저장 동의 시 Diagnosis.landmarks에 기록.
      landmarks: {
        version: 'mediapipe-face-landmarker-v1',
        points: [
          [0.4, 0.3],
          [0.6, 0.3],
          [0.5, 0.55],
          [0.45, 0.7],
          [0.55, 0.7],
        ],
      },
      // 신규(검증 단계): YOLO 여드름 구역 리포트 + 5클래스 질환 분류 목업값.
      acneReport: '이마에 비염증성 여드름 1개, 염증성 여드름 1개가 있습니다.',
      diseaseClassification: { label: '정상', confidence: 0.98 },
    };
  }
}
