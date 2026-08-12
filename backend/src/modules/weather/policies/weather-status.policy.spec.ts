import { AirStatus } from '../../../common/enums/air-status.enum';
import { WeatherStatusPolicy } from './weather-status.policy';

/**
 * R5: 대기질 등급 판정의 단일 출처. 프론트는 이 결과를 그대로 표시하므로
 * 경계값이 바뀌면 사용자에게 보이는 등급이 바뀐다 — 경계마다 못을 박아둔다.
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

  // 자외선지수: 기상청 5단계('높음' 6~7)를 3단계로 압축할 때 6부터 '나쁨'으로 본다.
  // 자외선 차단 안내가 목적이므로 '높음' 구간에서 이미 경고한다.
  describe.each([
    [0, AirStatus.GOOD],
    [2.9, AirStatus.GOOD],
    [3, AirStatus.MODERATE],
    [5.9, AirStatus.MODERATE],
    [6, AirStatus.BAD],
    [11, AirStatus.BAD],
  ])('uvStatus(%s)', (uv, expected) => {
    it(`→ ${expected}`, () => expect(policy.uvStatus(uv)).toBe(expected));
  });

  // 환경부 통합대기환경지수 구간. 경계값은 아래 등급에 속한다(초과 비교).
  describe.each([
    [0.03, AirStatus.GOOD],
    [0.031, AirStatus.MODERATE],
    [0.09, AirStatus.MODERATE],
    [0.091, AirStatus.BAD],
  ])('ozoneStatus(%s)', (ppm, expected) => {
    it(`→ ${expected}`, () => expect(policy.ozoneStatus(ppm)).toBe(expected));
  });

  describe.each([
    [30, AirStatus.GOOD],
    [31, AirStatus.MODERATE],
    [80, AirStatus.MODERATE],
    [81, AirStatus.BAD],
  ])('pm10Status(%s)', (pm10, expected) => {
    it(`→ ${expected}`, () => expect(policy.pm10Status(pm10)).toBe(expected));
  });

  describe.each([
    [15, AirStatus.GOOD],
    [16, AirStatus.MODERATE],
    [35, AirStatus.MODERATE],
    [36, AirStatus.BAD],
  ])('pm25Status(%s)', (pm25, expected) => {
    it(`→ ${expected}`, () => expect(policy.pm25Status(pm25)).toBe(expected));
  });

  describe.each([
    [50, AirStatus.GOOD],
    [51, AirStatus.MODERATE],
    [100, AirStatus.MODERATE],
    [101, AirStatus.BAD],
  ])('caiStatus(%s)', (cai, expected) => {
    it(`→ ${expected}`, () => expect(policy.caiStatus(cai)).toBe(expected));
  });
});
