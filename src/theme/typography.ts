// F83: Pretendard 정적 3종(Regular·SemiBold·Bold) — 한국 프로덕트 사실상 표준, OFL 라이선스.
// 가중치가 폰트 파일에 이미 들어 있으므로 fontWeight는 'normal'로 둔다
// (Android에서 Bold 파일 위에 synthetic bold가 겹치는 것 방지).
// 로딩은 app/_layout.tsx의 useFonts — 실패 시 시스템 폰트로 폴백된다.

const family = {
  regular: 'Pretendard-Regular',
  semiBold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

export const typography = {
  displayLg: { fontFamily: family.bold, fontSize: 28, fontWeight: 'normal' as const, lineHeight: 36 },
  displaySm: { fontFamily: family.bold, fontSize: 22, fontWeight: 'normal' as const, lineHeight: 30 },
  headline: { fontFamily: family.bold, fontSize: 18, fontWeight: 'normal' as const, lineHeight: 24 },
  subtitle: { fontFamily: family.semiBold, fontSize: 15, fontWeight: 'normal' as const, lineHeight: 20 },
  body: { fontFamily: family.regular, fontSize: 15, fontWeight: 'normal' as const, lineHeight: 22 },
  bodySm: { fontFamily: family.regular, fontSize: 13, fontWeight: 'normal' as const, lineHeight: 18 },
  caption: { fontFamily: family.semiBold, fontSize: 11, fontWeight: 'normal' as const, lineHeight: 14 },
  badge: { fontFamily: family.bold, fontSize: 11, fontWeight: 'normal' as const, lineHeight: 14 },
} as const;

/**
 * F76: OS 큰 글꼴 설정 대응 — 고정 크기 레이아웃(게이지·배지·칩·탭바 등) 안의
 * 텍스트에 거는 확대 상한. 본문·안내 문구에는 걸지 않는다(접근성 유지).
 * 사용: <Text maxFontSizeMultiplier={MAX_FONT_SCALE} …>
 */
export const MAX_FONT_SCALE = 1.3;
