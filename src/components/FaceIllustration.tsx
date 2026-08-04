import Svg, { Ellipse, Path } from 'react-native-svg';
import { colors } from '../theme';

// 촬영한 사진 대신 쓰는 얼굴 아이콘. viewBox를 photoWrap 컨테이너와 동일한 3:4 비율로 맞춰서
// (150x200) 핀 위치(퍼센트)가 실제 눈/코/입 좌표와 어긋나지 않게 한다. preserveAspectRatio="none"은
// 혹시 컨테이너 비율이 바뀌어도 항상 꽉 채워서 핀 좌표와의 정합이 깨지지 않도록 하는 안전장치다.
export function FaceIllustration() {
  const skinColor = colors.surfaceMuted;
  const lineColor = colors.gray500;

  return (
    <Svg viewBox="0 0 150 200" preserveAspectRatio="none" width="100%" height="100%">
      {/* 얼굴 */}
      <Ellipse cx={75} cy={100} rx={48} ry={62} fill={skinColor} stroke={lineColor} strokeWidth={2} />

      {/* 눈 */}
      <Ellipse cx={58} cy={88} rx={4} ry={5} fill={lineColor} />
      <Ellipse cx={92} cy={88} rx={4} ry={5} fill={lineColor} />

      {/* 코 */}
      <Path
        d="M 75 96 L 72 112 L 78 112"
        stroke={lineColor}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 입 */}
      <Path d="M 63 128 Q 75 134 87 128" stroke={lineColor} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
