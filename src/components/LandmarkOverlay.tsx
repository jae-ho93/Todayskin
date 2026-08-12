import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  fitProjection,
  projectPoint,
  subsamplePoints,
  type Size,
} from '../lib/landmark-overlay';
import { colors } from '../theme';

interface LandmarkOverlayProps {
  /** 정규화 좌표 `[[x, y], ...]` (0~1). */
  points: readonly number[][];
  /** 오버레이가 덮는 화면 박스. `onLayout`으로 잰 값. */
  box: Size;
  /**
   * 사진 원본 크기. `onLoad`로 잰다.
   *
   * null이면 사진이 없거나(랜드마크만 저장된 경우) 아직 로드 전이다. 이때는 원본
   * 비율을 알 수 없으므로 정사각으로 보고 `contain`한다 — 늘려 채우면 점이 실제
   * 얼굴 모양과 다른 비율로 찌그러진다.
   */
  imageSize: Size | null;
  /** 점 반지름(화면 px). 뷰박스가 픽셀이라 스케일에 딸려 줄지 않는다. */
  dotRadius: number;
  /** 이 수를 넘으면 고르게 솎는다. */
  maxPoints: number;
}

/**
 * F65: 얼굴 랜드마크 오버레이.
 *
 * 사진은 `resizeMode="cover"`로 비율을 지키며 잘라 채우므로 오버레이도 같은 규칙을
 * 따라야 점이 코·눈 위치에 맞는다. 예전에는 `preserveAspectRatio="none"`으로 늘려
 * 그려서 두 좌표계가 어긋났다.
 */
export function LandmarkOverlay({
  points,
  box,
  imageSize,
  dotRadius,
  maxPoints,
}: LandmarkOverlayProps) {
  if (box.width <= 0 || box.height <= 0 || points.length === 0) return null;

  const source = imageSize ?? { width: 1, height: 1 };
  const projection = fitProjection(box, source, imageSize ? 'cover' : 'contain');
  if (projection.scale <= 0) return null;

  const visible = subsamplePoints(points, maxPoints);

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width={box.width}
      height={box.height}
      viewBox={`0 0 ${box.width} ${box.height}`}
    >
      {visible.map((point, i) => {
        const { x, y } = projectPoint(point, source, projection);
        return <Circle key={i} cx={x} cy={y} r={dotRadius} fill={LANDMARK_FILL} />;
      })}
    </Svg>
  );
}

const LANDMARK_FILL = colors.sage;
