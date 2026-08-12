import { colors } from '../theme';
import type { AirStatus, UvLevel } from '../types';

/**
 * R25/F64: 지표 등급의 라벨·색상 단일 출처.
 *
 * 등급 판정 자체는 서버(`weather-status.policy.ts`)가 하고, 여기서는 표기만 맡는다.
 * `Record<AirStatus, T>` / `Record<UvLevel, T>`로 선언해 등급이 추가되면 컴파일이 실패한다.
 *
 * N40/F64에서 어휘를 지표별로 나눴다. 자외선은 "좋음/나쁨"이 아니라 "낮음/높음"으로
 * 말한다 — 하나로 합쳐 쓰던 때는 자외선지수 9가 "나쁨"으로 표기됐다.
 */

// ── 대기질 (미세먼지·초미세먼지·오존·통합대기환경지수) ──────────

export const AIR_STATUS_LABEL: Record<AirStatus, string> = {
  good: '좋음',
  moderate: '보통',
  bad: '나쁨',
  veryBad: '매우나쁨',
};

/** 텍스트·아이콘 등 전경색. */
export const AIR_STATUS_COLOR: Record<AirStatus, string> = {
  good: colors.statusGood,
  moderate: colors.statusModerate,
  bad: colors.statusBad,
  veryBad: colors.statusVeryBad,
};

/** 흰 배경 위 작은 본문 텍스트용 — 대비를 위해 한 단계 진한 짝. */
export const AIR_STATUS_TEXT_COLOR: Record<AirStatus, string> = {
  good: colors.statusGoodText,
  moderate: colors.statusModerateText,
  bad: colors.statusBadText,
  veryBad: colors.statusVeryBadText,
};

/** 배지 배경색 — 전경색의 연한 짝. */
export const AIR_STATUS_BG: Record<AirStatus, string> = {
  good: colors.sageLight,
  moderate: colors.ochreLight,
  bad: colors.coralLight,
  veryBad: colors.statusVeryBadLight,
};

/**
 * 낮은 등급 → 높은 등급 순. 게이지 눈금처럼 "순서"가 필요한 곳의 단일 출처다.
 * 맵의 선언 순서에 기대면(`Object.values`) 키를 재배치했을 때 조용히 어긋난다.
 */
export const AIR_STATUS_ORDER: readonly AirStatus[] = [
  'good',
  'moderate',
  'bad',
  'veryBad',
];

export function airStatusLabel(status: AirStatus): string {
  return AIR_STATUS_LABEL[status];
}

// ── 자외선 (기상청 5단계) ──────────────────────────────────

export const UV_LEVEL_LABEL: Record<UvLevel, string> = {
  low: '낮음',
  moderate: '보통',
  high: '높음',
  veryHigh: '매우높음',
  danger: '위험',
};

export const UV_LEVEL_COLOR: Record<UvLevel, string> = {
  low: colors.statusGood,
  moderate: colors.statusModerate,
  high: colors.statusHigh,
  veryHigh: colors.statusBad,
  danger: colors.statusDanger,
};

export const UV_LEVEL_TEXT_COLOR: Record<UvLevel, string> = {
  low: colors.statusGoodText,
  moderate: colors.statusModerateText,
  high: colors.statusHighText,
  veryHigh: colors.statusBadText,
  danger: colors.statusDangerText,
};

export const UV_LEVEL_BG: Record<UvLevel, string> = {
  low: colors.sageLight,
  moderate: colors.ochreLight,
  high: colors.statusHighLight,
  veryHigh: colors.coralLight,
  danger: colors.statusDangerLight,
};

export const UV_LEVEL_ORDER: readonly UvLevel[] = [
  'low',
  'moderate',
  'high',
  'veryHigh',
  'danger',
];

export function uvLevelLabel(level: UvLevel): string {
  return UV_LEVEL_LABEL[level];
}

/**
 * "피부에 부담이 되는 수준인가" — 나쁨 이상을 한 번에 묻는다.
 *
 * 등급이 늘 때 `status === 'bad'` 같은 개별 비교는 조용히 새 등급을 놓친다.
 * 실제로 '매우나쁨'을 추가했을 때 기존 비교들이 최악 구간에서 경고를 멈췄다.
 */
export function isAirConcerning(status: AirStatus | null | undefined): boolean {
  return status === 'bad' || status === 'veryBad';
}

/** 자외선이 차단제 안내를 띄울 수준인가 — 높음 이상. */
export function isUvConcerning(level: UvLevel | null | undefined): boolean {
  return level === 'high' || level === 'veryHigh' || level === 'danger';
}
