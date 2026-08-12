import { AirStatus } from '../../../common/enums/air-status.enum';
import { UvLevel } from '../../../common/enums/uv-level.enum';
import { WeatherStatusPolicy } from './weather-status.policy';

/**
 * R5 / N40: 지표별 등급 판정의 단일 출처. 프론트는 이 결과를 그대로 표시하므로
 * 경계값이 바뀌면 사용자에게 보이는 등급이 바뀐다 — 경계마다 못을 박아둔다.
 *
 * 모든 등급의 양쪽 경계를 덮는다. 한 등급이라도 경계가 없으면 그 구간은
 * 조용히 옆 등급으로 새도 테스트가 통과한다.
 */
describe('WeatherStatusPolicy', () => {
  const policy = new WeatherStatusPolicy();

  it('값이 없으면 등급도 없다', () => {
    expect(policy.uvStatus(null)).toBeNull();
    expect(policy.pm10Status(null)).toBeNull();
    expect(policy.pm25Status(null)).toBeNull();
    expect(policy.ozoneStatus(null)).toBeNull();
    expect(policy.caiStatus(null)).toBeNull();
  });

  // 자외선지수(기상청 5단계): 낮음 0~2 / 보통 3~5 / 높음 6~7 / 매우높음 8~10 / 위험 11+
  // 정수 구간 고시라 `>=`로 끊는다.
  describe.each([
    [0, UvLevel.LOW],
    [2.9, UvLevel.LOW],
    [3, UvLevel.MODERATE],
    [5.9, UvLevel.MODERATE],
    [6, UvLevel.HIGH],
    [7.9, UvLevel.HIGH],
    [8, UvLevel.VERY_HIGH],
    [9, UvLevel.VERY_HIGH], // 실기기에서 '나쁨'으로 잘못 표기됐던 값
    [10.9, UvLevel.VERY_HIGH],
    [11, UvLevel.DANGER],
    [15, UvLevel.DANGER],
  ])('uvStatus(%s)', (uv, expected) => {
    it(`→ ${expected}`, () => expect(policy.uvStatus(uv)).toBe(expected));
  });

  // 대기질 4종은 "이하/초과" 고시라 경계값이 아래 등급에 속한다.
  // 오존(ppm): 좋음 ~0.030 / 보통 ~0.090 / 나쁨 ~0.150 / 매우나쁨 0.151+
  describe.each([
    [0.03, AirStatus.GOOD],
    [0.031, AirStatus.MODERATE],
    [0.09, AirStatus.MODERATE],
    [0.091, AirStatus.BAD],
    [0.15, AirStatus.BAD],
    [0.151, AirStatus.VERY_BAD],
  ])('ozoneStatus(%s)', (ppm, expected) => {
    it(`→ ${expected}`, () => expect(policy.ozoneStatus(ppm)).toBe(expected));
  });

  // 미세먼지 PM10: 좋음 ~30 / 보통 ~80 / 나쁨 ~150 / 매우나쁨 151+
  describe.each([
    [30, AirStatus.GOOD],
    [31, AirStatus.MODERATE],
    [80, AirStatus.MODERATE],
    [81, AirStatus.BAD],
    [150, AirStatus.BAD],
    [151, AirStatus.VERY_BAD],
  ])('pm10Status(%s)', (pm10, expected) => {
    it(`→ ${expected}`, () => expect(policy.pm10Status(pm10)).toBe(expected));
  });

  // 초미세먼지 PM2.5: 좋음 ~15 / 보통 ~35 / 나쁨 ~75 / 매우나쁨 76+
  describe.each([
    [15, AirStatus.GOOD],
    [16, AirStatus.MODERATE],
    [35, AirStatus.MODERATE],
    [36, AirStatus.BAD],
    [75, AirStatus.BAD],
    [76, AirStatus.VERY_BAD],
  ])('pm25Status(%s)', (pm25, expected) => {
    it(`→ ${expected}`, () => expect(policy.pm25Status(pm25)).toBe(expected));
  });

  // 통합대기환경지수 CAI: 좋음 ~50 / 보통 ~100 / 나쁨 ~250 / 매우나쁨 251+
  describe.each([
    [50, AirStatus.GOOD],
    [51, AirStatus.MODERATE],
    [100, AirStatus.MODERATE],
    [101, AirStatus.BAD],
    [250, AirStatus.BAD],
    [251, AirStatus.VERY_BAD],
  ])('caiStatus(%s)', (cai, expected) => {
    it(`→ ${expected}`, () => expect(policy.caiStatus(cai)).toBe(expected));
  });
});
