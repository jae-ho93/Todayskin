import { Image, ImageSourcePropType, StyleSheet } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { colors } from '../theme';
import type { FacePart, Gender } from '../types';

// 진단 결과 화면에서 부위 핀을 얹을 때 쓰는 좌표(퍼센트). assets/face/{female,male}.png 두 이미지에서
// 눈썹/눈/코/입/턱 위치를 직접 좌표 그리드로 재서 정한 값이라, 사진을 다시 자르면 이 값도 다시 맞춰야 한다.
export const FACE_PART_PIN_POSITION: Record<FacePart, { xPct: number; yPct: number }> = {
  forehead: { xPct: 50, yPct: 34 },
  glabella: { xPct: 50, yPct: 42 },
  eyeArea: { xPct: 68, yPct: 47 },
  cheek: { xPct: 66, yPct: 54 },
  lips: { xPct: 50, yPct: 59 },
  jaw: { xPct: 50, yPct: 69 },
};

const FACE_IMAGE: Record<'female' | 'male', ImageSourcePropType> = {
  female: require('../../assets/face/female.png'),
  male: require('../../assets/face/male.png'),
};

interface FaceIllustrationProps {
  gender?: Gender;
}

// 루트 폴더 image.png(여자: 리본 헤어밴드+웨이브 롱헤어+니트, 남자: 스트라이프 헤어밴드+숏헤어+티셔츠)를
// 그대로 잘라 assets/face/{female,male}.png로 쓴다. 3:4 비율(419x559)로 잘라서 photoWrap 컨테이너와
// 정합이 맞고, 위 FACE_PART_PIN_POSITION 좌표가 두 이미지 모두에서 눈/코/입 위치와 크게 어긋나지 않는다.
// gender가 없으면(선택 입력이라 비어있을 수 있음) 어느 한쪽으로 단정하지 않고 중립 형태의 SVG로 대체한다.
export function FaceIllustration({ gender }: FaceIllustrationProps) {
  if (gender === 'female' || gender === 'male') {
    return <Image source={FACE_IMAGE[gender]} style={styles.image} resizeMode="cover" />;
  }

  const skinColor = colors.surfaceMuted;
  const lineColor = colors.gray500;
  return (
    <Svg viewBox="0 0 150 200" preserveAspectRatio="none" width="100%" height="100%">
      <Ellipse cx={75} cy={100} rx={48} ry={62} fill={skinColor} stroke={lineColor} strokeWidth={2} />
      <Ellipse cx={58} cy={88} rx={4} ry={5} fill={lineColor} />
      <Ellipse cx={92} cy={88} rx={4} ry={5} fill={lineColor} />
      <Path
        d="M 75 96 L 72 112 L 78 112"
        stroke={lineColor}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M 63 128 Q 75 134 87 128" stroke={lineColor} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
});
