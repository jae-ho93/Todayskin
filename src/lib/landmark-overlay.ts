/**
 * F65: 랜드마크 정규화 좌표 → 화면 좌표 환산.
 *
 * 서버는 0~1로 정규화한 좌표를 준다. 그 값을 그대로 `viewBox="0 0 1 1"`에 넣고
 * `preserveAspectRatio="none"`으로 늘려 그렸는데, 사진은 `resizeMode="cover"`로
 * 비율을 지키며 잘라 채운다. **두 좌표계가 다르니 점이 얼굴에서 밀렸다.**
 *
 * 반지름도 같은 문제였다. 뷰박스가 0~1이라 `r=0.01`은 140px 박스에서 1.4px이 되고,
 * 반투명 색이라 사진 위에서 사실상 보이지 않았다.
 *
 * 그래서 환산을 화면 픽셀로 끌어내 여기 모았다. SVG는 픽셀 뷰박스를 쓰고 반지름도
 * 픽셀로 준다 — 뷰박스 스케일에 딸려 축소되지 않는다.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Projection {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * 원본을 박스에 맞출 때의 배율과 여백.
 *
 * - `cover`: 박스를 꽉 채우고 넘치는 부분을 자른다 (`resizeMode="cover"`와 같다).
 * - `contain`: 원본이 다 들어가게 줄이고 남는 쪽에 여백을 둔다.
 *
 * 박스나 원본 크기가 0이면 배율을 0으로 준다. 이 경우 점은 한 자리에 겹치는데,
 * 레이아웃 측정 전 한 프레임 동안만 그렇고 측정되면 곧바로 제자리를 찾는다.
 */
export function fitProjection(
  box: Size,
  source: Size,
  mode: 'cover' | 'contain',
): Projection {
  if (box.width <= 0 || box.height <= 0 || source.width <= 0 || source.height <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0 };
  }

  const scaleX = box.width / source.width;
  const scaleY = box.height / source.height;
  const scale = mode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

  return {
    scale,
    offsetX: (box.width - source.width * scale) / 2,
    offsetY: (box.height - source.height * scale) / 2,
  };
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * 정규화 좌표(0~1) 하나를 화면 픽셀로 옮긴다.
 *
 * 서버가 주는 타입이 `number[][]`이라 점 하나가 `[x, y]`라는 보장이 타입에 없다.
 * 성분이 빠진 점은 0으로 읽어 원점에 찍는다 — 좌표에 NaN이 들어가면 SVG가 그
 * 점만이 아니라 그리기 자체를 건너뛴다.
 */
export function projectPoint(
  point: readonly number[],
  source: Size,
  projection: Projection,
): ScreenPoint {
  const [nx = 0, ny = 0] = point;
  return {
    x: projection.offsetX + nx * source.width * projection.scale,
    y: projection.offsetY + ny * source.height * projection.scale,
  };
}

/**
 * 점을 고르게 솎는다.
 *
 * 얼굴 랜드마크는 478개다. 목록 썸네일(140×160)에서는 다 그려도 뭉쳐서 덩어리로만
 * 보이고, 카드마다 478개 SVG 노드가 생겨 스크롤이 무거워진다. 앞에서 잘라내면
 * 얼굴 한쪽만 남으므로 일정 간격으로 건너뛴다.
 */
export function subsamplePoints<T>(points: readonly T[], max: number): T[] {
  if (max <= 0) return [];
  if (points.length <= max) return [...points];

  const stride = Math.ceil(points.length / max);
  const picked: T[] = [];
  for (let i = 0; i < points.length; i += stride) {
    picked.push(points[i]);
  }
  return picked;
}
