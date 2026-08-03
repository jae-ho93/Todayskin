// Weatherskin 디자인 시스템 — Figma AI 프롬프트 컬러 스펙 기준
// 실제 브랜드 컬러가 확정되면 sage/coral 값만 교체하면 전체 UI에 반영됨

export const colors = {
  // 베이스
  background: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceMuted: '#F2F1EC',

  // 소프트 그레이 스케일
  gray50: '#F7F7F5',
  gray100: '#ECEBE6',
  gray200: '#DAD9D2',
  gray300: '#B9B8AF',
  gray400: '#8E8D84',
  gray500: '#6B6A62',
  gray600: '#4C4B45',
  gray700: '#33322E',
  gray900: '#1D1C19',

  // 포인트 컬러
  sage: '#7A9E7E', // 피부 건강/안정
  sageDark: '#5C7F60',
  sageLight: '#DCE8DD',
  coral: '#FF8C7A', // 주의/액션
  coralDark: '#E06A57',
  coralLight: '#FFE3DE',
  ochre: '#D6A83B', // B등급 배지 전용 (옐로 오커)
  ochreLight: '#F6E8C7',

  // 근거 등급(A/B/C) 배지 전용 팔레트
  gradeA: {
    bg: '#5C7F60', // 진한 세이지
    text: '#FFFFFF',
  },
  gradeB: {
    bg: '#D6A83B', // 옐로 오커
    text: '#3A2E0B',
  },
  gradeC: {
    bg: '#E4E3DC', // 라이트 그레이 — 확정적이지 않다는 인상
    text: '#6B6A62',
  },

  // 날씨/대기질 상태 (좋음/보통/나쁨)
  statusGood: '#7A9E7E',
  statusModerate: '#D6A83B',
  statusBad: '#E06A57',

  // 텍스트
  textPrimary: '#1D1C19',
  textSecondary: '#6B6A62',
  textTertiary: '#8E8D84',
  textInverse: '#FAFAF8',

  border: '#E5E4DD',
  shadow: 'rgba(29, 28, 25, 0.08)',
} as const;

export type ColorToken = keyof typeof colors;
