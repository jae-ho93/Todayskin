import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * F72: 업로드 전 이미지 축소.
 * 추론 입력은 부위 크롭 224²라 장변 1440px이면 정보 손실이 없다.
 * 원본(최대 10MB)을 그대로 올리면 LTE에서 업로드가 수 초~수십 초 걸려
 * "분석 중" 체감 지연의 주범이 된다.
 */
export const UPLOAD_MAX_EDGE = 1440;
export const UPLOAD_JPEG_QUALITY = 0.8;

/**
 * 리사이즈 목표 계산. 장변을 maxEdge로 맞추고 비율은 유지한다.
 * - 이미 maxEdge 이하면 null (리사이즈 불필요 — 업스케일 금지)
 * - 크기를 모르면 null (업스케일 위험을 감수하지 않는다)
 */
export function resizeTarget(
  width: number | undefined,
  height: number | undefined,
  maxEdge: number = UPLOAD_MAX_EDGE,
): { width: number | null; height: number | null } | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge, height: null } : { width: null, height: maxEdge };
}

/**
 * 업로드용 이미지 준비 — 장변 1440px 리사이즈 + JPEG 재압축.
 * 실패하면 원본 URI를 그대로 돌려준다. 리사이즈가 안 됐다고 분석이 막히면 안 된다.
 */
export async function prepareUploadImage(
  uri: string,
  width?: number,
  height?: number,
): Promise<string> {
  try {
    const target = resizeTarget(width, height);
    if (!target) return uri;
    const context = ImageManipulator.manipulate(uri);
    context.resize(target);
    const image = await context.renderAsync();
    const saved = await image.saveAsync({
      compress: UPLOAD_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return saved.uri;
  } catch {
    return uri;
  }
}
