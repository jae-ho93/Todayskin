
import { AirStatus } from '../../../common/enums/air-status.enum';
import { UvLevel } from '../../../common/enums/uv-level.enum';

/**
 * WeatherStatusPolicy — 지표별 등급 판정의 단일 출처.
 *
 * N40: 지표마다 공식 등급 체계가 달라 어휘를 나눴다.
 * - 자외선지수(기상청): 낮음 · 보통 · 높음 · 매우높음 · 위험 (5단계)
 * - 대기질(에어코리아): 좋음 · 보통 · 나쁨 · 매우나쁨 (4단계)
 *
 * 경계값 규칙: 자외선은 정수 구간이라 `>=`로 끊고, 대기질은 "이하/초과"로 고시돼 있어
 * `>`로 끊는다. 경계 하나가 곧 오표기라 등급마다 경계값 테스트를 둔다(R5에서 오존
 * 경계를 `>=`에서 `>`로 고친 것과 같은 이유).
 */
export class WeatherStatusPolicy {
  /**
   * 자외선지수 (기상청 생활기상지수 기준).
   * 낮음 0~2 / 보통 3~5 / 높음 6~7 / 매우높음 8~10 / 위험 11 이상
   */
  uvStatus(uv: number | null): UvLevel | null {
    if (uv === null) return null;
    if (uv >= 11) return UvLevel.DANGER;
    if (uv >= 8) return UvLevel.VERY_HIGH;
    if (uv >= 6) return UvLevel.HIGH;
    if (uv >= 3) return UvLevel.MODERATE;
    return UvLevel.LOW;
  }

  /**
   * 초미세먼지 PM2.5 (㎍/㎥).
   * 좋음 ~15 / 보통 ~35 / 나쁨 ~75 / 매우나쁨 76 이상
   */
  pm25Status(pm25: number | null): AirStatus | null {
    if (pm25 === null) return null;
    if (pm25 > 75) return AirStatus.VERY_BAD;
    if (pm25 > 35) return AirStatus.BAD;
    if (pm25 > 15) return AirStatus.MODERATE;
    return AirStatus.GOOD;
  }

  /**
   * 오존 (ppm).
   * 좋음 ~0.030 / 보통 ~0.090 / 나쁨 ~0.150 / 매우나쁨 0.151 이상
   */
  ozoneStatus(ppm: number | null): AirStatus | null {
    if (ppm === null) return null;
    if (ppm > 0.15) return AirStatus.VERY_BAD;
    if (ppm > 0.09) return AirStatus.BAD;
    if (ppm > 0.03) return AirStatus.MODERATE;
    return AirStatus.GOOD;
  }

  /**
   * 미세먼지 PM10 (㎍/㎥).
   * 좋음 ~30 / 보통 ~80 / 나쁨 ~150 / 매우나쁨 151 이상
   */
  pm10Status(pm10: number | null): AirStatus | null {
    if (pm10 === null) return null;
    if (pm10 > 150) return AirStatus.VERY_BAD;
    if (pm10 > 80) return AirStatus.BAD;
    if (pm10 > 30) return AirStatus.MODERATE;
    return AirStatus.GOOD;
  }

  /**
   * 통합대기환경지수 CAI.
   * 좋음 ~50 / 보통 ~100 / 나쁨 ~250 / 매우나쁨 251 이상
   */
  caiStatus(cai: number | null): AirStatus | null {
    if (cai === null) return null;
    if (cai > 250) return AirStatus.VERY_BAD;
    if (cai > 100) return AirStatus.BAD;
    if (cai > 50) return AirStatus.MODERATE;
    return AirStatus.GOOD;
  }
}
