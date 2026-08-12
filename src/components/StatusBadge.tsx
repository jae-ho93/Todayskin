import { StyleSheet, Text, View } from 'react-native';
import type { AirStatus, UvLevel } from '../types';
import {
  AIR_STATUS_BG,
  AIR_STATUS_COLOR,
  AIR_STATUS_LABEL,
  UV_LEVEL_BG,
  UV_LEVEL_COLOR,
  UV_LEVEL_LABEL,
} from '../lib/air-status';
import { colors, MAX_FONT_SCALE, radius, spacing, typography } from '../theme';

/**
 * F64: 자외선과 대기질은 등급 어휘가 다르다(낮음~위험 / 좋음~매우나쁨).
 * 판별 유니온으로 받아 스케일에 맞지 않는 등급을 넘기면 컴파일이 실패하게 한다.
 * `status`는 null/undefined일 수 있고, 그때는 "측정 불가"로 표시한다.
 */
type StatusBadgeProps = { label: string } & (
  | { scale: 'air'; status?: AirStatus | null }
  | { scale: 'uv'; status?: UvLevel | null }
);

export function StatusBadge(props: StatusBadgeProps) {
  const { label } = props;
  if (!props.status) {
    return (
      <View style={[styles.badge, styles.badgeUnavailable]}>
        <View style={[styles.dot, styles.dotUnavailable]} />
        <Text
          style={[styles.text, styles.textUnavailable]}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          {label} 측정 불가
        </Text>
      </View>
    );
  }

  const isUv = props.scale === 'uv';
  const color = isUv ? UV_LEVEL_COLOR[props.status] : AIR_STATUS_COLOR[props.status];
  const background = isUv ? UV_LEVEL_BG[props.status] : AIR_STATUS_BG[props.status];
  const statusLabel = isUv
    ? UV_LEVEL_LABEL[props.status]
    : AIR_STATUS_LABEL[props.status];

  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {label} {statusLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    ...typography.caption,
    fontWeight: '700',
  },
  badgeUnavailable: { backgroundColor: colors.gray100 },
  dotUnavailable: { backgroundColor: colors.gray400 },
  textUnavailable: { color: colors.gray400 },
});
