import { FacePart } from '@prisma/client';

/**
 * 부위별 추론 결과 단위.
 * grade: "양호" | "보통" | "건조" | "매우 건조" 등(모델 명세 확정 전까지 한국어 등급 문자열).
 * moisture/elasticity는 모델이 산출하지 않는 부위(예: 입술 moisture만)는 null.
 * note는 선택. 모델 명세 확정 전까지는 비워둔다.
 */
export interface InferredPartMetric {
  part: FacePart;
  label: string;
  grade: string;
  moisture: number | null;
  elasticity: number | null;
  note: string | null;
}

/**
 * 추론 전체 결과.
 * overallScore: 0~100. modelVersion: 추론 모델 식별자. parts: 6개 부위.
 */
export interface InferenceResult {
  overallScore: number;
  modelVersion: string;
  parts: InferredPartMetric[];
}

/**
 * 피부 이미지 추론 Provider 인터페이스.
 *
 * Python AI 서버가 준비되면 PythonInferenceProvider를 추가해 이 인터페이스를 구현한다.
 * NestJS 진단 서비스는 이 인터페이스에만 의존하므로, Provider 교체 시 진단 서비스 본문은
 * 변경하지 않는다.
 *
 * 입력: 정면/좌/우 이미지 버퍼(MIME 포함). 원본 이미지는 저장하지 않고 처리 후 폐기한다.
 * 출력: 추론 결과(overallScore, modelVersion, parts).
 *
 * 실제 추론은 보류 상태이며, MockInferenceProvider는 개발/통합 테스트용 고정값을 반환한다.
 * 운영 환경에서 mock fallback이 실제 데이터처럼 보이지 않도록 환경 변수로 분리한다.
 */
export interface InferenceProvider {
  infer(images: InferenceImages): Promise<InferenceResult>;
}

export interface InferenceImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface InferenceImages {
  front: InferenceImage;
  left: InferenceImage;
  right: InferenceImage;
}

/**
 * NestJS DI 토큰. 인터페이스는 런타임 값이 아니므로 별도 심볼 토큰을 제공한다.
 * @Inject(INFERENCE_PROVIDER)로 주입한다.
 */
export const INFERENCE_PROVIDER = Symbol('INFERENCE_PROVIDER');

/**
 * 실제 추론 서버가 연결되지 않은 환경에서 사용하는 fail-closed provider.
 *
 * Mock 결과를 실제 진단 결과처럼 반환하면 사용자는 잘못된 피부 정보를
 * 받게 되므로, mock이 명시적으로 켜지지 않은 경우에는 항상 호출을 실패시킨다.
 */
export class InferenceUnavailable extends Error {
  constructor(message = 'Inference provider is not configured') {
    super(message);
    this.name = 'InferenceUnavailable';
  }
}
