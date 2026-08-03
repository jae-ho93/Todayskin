// 헤드라인은 굵은 산세리프(Pretendard Bold 지향), 본문은 레귤러
// Pretendard 폰트 파일을 assets/fonts 에 추가하고 App 진입점에서 useFonts로 로드하면
// fontFamily: 'Pretendard-Bold' / 'Pretendard-Regular' 로 교체 가능. 현재는 시스템 폰트 사용.

import { Platform } from 'react-native';

const systemFont = Platform.select({ ios: 'System', android: 'sans-serif', default: undefined });

export const typography = {
  displayLg: { fontFamily: systemFont, fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
  displaySm: { fontFamily: systemFont, fontSize: 22, fontWeight: '700' as const, lineHeight: 30 },
  headline: { fontFamily: systemFont, fontSize: 18, fontWeight: '700' as const, lineHeight: 24 },
  subtitle: { fontFamily: systemFont, fontSize: 15, fontWeight: '600' as const, lineHeight: 20 },
  body: { fontFamily: systemFont, fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodySm: { fontFamily: systemFont, fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  caption: { fontFamily: systemFont, fontSize: 11, fontWeight: '500' as const, lineHeight: 14 },
  badge: { fontFamily: systemFont, fontSize: 11, fontWeight: '700' as const, lineHeight: 14 },
} as const;
