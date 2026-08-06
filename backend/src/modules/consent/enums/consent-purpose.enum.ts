/**
 * N3: 동의 목적.
 *
 * - diagnosis_image_processing: 진단 업로드·추론 처리 (기능 진입 필수)
 * - diagnosis_image_storage: S3 암호화 저장 (선택). 미동의면 추론 후 즉시 삭제
 * - ai_recommendation_data_transfer: Gemini 등 외부 AI로 피부/날씨 데이터 전송 (필수)
 *
 * decision.md T9-03 Option B 기준. storage는 이미지 저장 정책을 분리하기 위해 추가.
 */
export enum ConsentPurpose {
  DIAGNOSIS_IMAGE_PROCESSING = 'diagnosis_image_processing',
  DIAGNOSIS_IMAGE_STORAGE = 'diagnosis_image_storage',
  AI_RECOMMENDATION_DATA_TRANSFER = 'ai_recommendation_data_transfer',
}
