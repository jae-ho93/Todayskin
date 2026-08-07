import { colors } from '../theme';

// backend/inference-service/part_mapping.py의 _score_to_grade()와 동일한 4단계 등급 문자열.
// (양호 >=75 / 보통 >=50 / 건조 >=25 / 매우 건조 <25, score는 100=최고)
const GRADE_COLOR: Record<string, string> = {
  양호: colors.statusGood,
  보통: colors.statusModerate,
  건조: colors.coral,
  '매우 건조': colors.coralDark,
};

// 목업 데이터나 향후 모델 변경으로 다른 등급 문자열이 오더라도 깨지지 않도록 기본값을 둔다.
const DEFAULT_GRADE_COLOR = colors.gray400;

export function gradeToColor(grade: string): string {
  return GRADE_COLOR[grade] ?? DEFAULT_GRADE_COLOR;
}
