import { ConsentPurpose } from './enums/consent-purpose.enum';

/**
 * N3: 동의 version registry.
 *
 * 기능 진입 조건은 required=true인 purpose의 currentVersion과
 * 사용자 ConsentRecord.version이 일치하고 agreed=true이며 revokedAt이 없을 때만 통과한다.
 * version을 올리면 기존 동의는 무효화되어 재동의가 필요하다.
 */
export interface ConsentPurposeDefinition {
  purpose: ConsentPurpose;
  /** 현재 유효한 문서/약관 version */
  currentVersion: string;
  /** true면 해당 기능 진입에 필수 */
  required: boolean;
  title: string;
  description: string;
  /**
   * 철회 후 보존 정책 요약.
   * - keep_results: 과거 진단/추천 점수·문구는 유지, 신규 처리만 차단
   * - delete_images: S3 원본 이미지와 DB 메타를 삭제
   */
  withdrawalPolicy: 'keep_results' | 'delete_images';
}

export const CONSENT_REGISTRY: readonly ConsentPurposeDefinition[] = [
  {
    purpose: ConsentPurpose.DIAGNOSIS_IMAGE_PROCESSING,
    currentVersion: '1.0.0',
    required: true,
    title: '피부 진단 이미지 처리',
    description:
      '촬영한 얼굴 이미지를 진단 추론(메모리 처리)에 사용하는 데 동의합니다. 원본 저장과는 별개입니다.',
    withdrawalPolicy: 'keep_results',
  },
  {
    purpose: ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE,
    currentVersion: '1.0.0',
    required: false,
    title: '진단 이미지 암호화 저장',
    description:
      '동의한 경우에만 얼굴 이미지를 AWS S3에 암호화 저장합니다. 미동의 시 추론 후 즉시 삭제합니다.',
    withdrawalPolicy: 'delete_images',
  },
  {
    purpose: ConsentPurpose.AI_RECOMMENDATION_DATA_TRANSFER,
    currentVersion: '1.0.0',
    required: true,
    title: 'AI 추천을 위한 데이터 전송',
    description:
      '피부 측정값과 날씨 스냅샷을 외부 AI(Gemini)로 전송해 맞춤 추천을 생성하는 데 동의합니다.',
    withdrawalPolicy: 'keep_results',
  },
] as const;

export function getConsentDefinition(
  purpose: ConsentPurpose,
): ConsentPurposeDefinition {
  const found = CONSENT_REGISTRY.find((d) => d.purpose === purpose);
  if (!found) {
    throw new Error(`Unknown consent purpose: ${purpose}`);
  }
  return found;
}

export function isKnownConsentPurpose(value: string): value is ConsentPurpose {
  return Object.values(ConsentPurpose).includes(value as ConsentPurpose);
}
