import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * phase 배지 팔레트 — 전부 같은 파스텔 톤(연한 배경 + 진한 동색 텍스트)이되 단계별로
 * 다른 색을 쓴다. phase 문구는 카테고리마다 다를 수 있어(weather/skin/combined는
 * "외출 후(세안 후)"/"자기 전" 고정, morning은 "외출 전"/"외출 중" 고정) 키워드로 매칭하고,
 * 못 알아본 문구는 마지막 색으로 묶는다.
 */
export const PHASE_PALETTE: { bg: string; accent: string; icon: IoniconName }[] = [
  { bg: '#DCEEDC', accent: '#4F8F5B', icon: 'water-outline' }, // 아침/세안 — 민트
  { bg: '#DCEAFB', accent: '#3F6FA6', icon: 'sunny-outline' }, // 외출 — 하늘빛
  { bg: '#E6DFF5', accent: '#6B4FA0', icon: 'moon-outline' }, // 자기 전/저녁 — 라벤더
  { bg: '#FDEBD3', accent: '#B9772E', icon: 'sparkles-outline' }, // 그 외 — 살구빛
];

export function phaseStyle(phase: string): (typeof PHASE_PALETTE)[number] {
  if (phase.includes('자기') || phase.includes('저녁') || phase.includes('밤') || phase.includes('취침')) {
    return PHASE_PALETTE[2];
  }
  if (phase.includes('아침') || phase.includes('세안')) return PHASE_PALETTE[0];
  if (phase.includes('외출')) return PHASE_PALETTE[1];
  return PHASE_PALETTE[3];
}
