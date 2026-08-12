import { colors } from '../theme';
import type { AirStatus } from '../types';

/**
 * R25: 대기질 등급(좋음/보통/나쁨)의 라벨·색상 단일 출처.
 *
 * 등급 판정 자체는 서버(weather-status.policy.ts)가 하고, 여기서는 표기만 맡는다.
 * `Record<AirStatus, T>`로 선언해 등급이 추가되면 컴파일이 실패하게 한다.
 */
export const AIR_STATUS_LABEL: Record<AirStatus, string> = {
  good: '좋음',
  moderate: '보통',
  bad: '나쁨',
};

/** 텍스트·아이콘 등 전경색. */
export const AIR_STATUS_COLOR: Record<AirStatus, string> = {
  good: colors.statusGood,
  moderate: colors.statusModerate,
  bad: colors.statusBad,
};

/** 흰 배경 위 작은 본문 텍스트용 — 대비를 위해 한 단계 진한 짝. */
export const AIR_STATUS_TEXT_COLOR: Record<AirStatus, string> = {
  good: colors.statusGoodText,
  moderate: colors.statusModerateText,
  bad: colors.statusBadText,
};

/** 배지 배경색 — 전경색의 연한 짝. */
export const AIR_STATUS_BG: Record<AirStatus, string> = {
  good: colors.sageLight,
  moderate: colors.ochreLight,
  bad: colors.coralLight,
};

export function airStatusLabel(status: AirStatus): string {
  return AIR_STATUS_LABEL[status];
}
