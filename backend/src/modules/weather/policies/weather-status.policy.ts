
import { AirStatus } from '../../../common/enums/air-status.enum';

/**
 * WeatherStatusPolicy — 기존 FastAPI weather.py의 _uv_status/_pm25_status 등
 * 상태 계산 함수들을 정책 객체로 분리.
 * 임계치는 FastAPI 기준과 동일.
 */
export class WeatherStatusPolicy {
  /** 자외선지수: 6 이상 나쁨, 3 이상 보통, 미만 좋음 */
  uvStatus(uv: number | null): AirStatus | null {
    if (uv === null) return null;
    if (uv >= 6) return AirStatus.BAD;
    if (uv >= 3) return AirStatus.MODERATE;
    return AirStatus.GOOD;
  }

  /** 초미세먼지(PM2.5): 35 초과 나쁨, 15 초과 보통, 이하 좋음 */
  pm25Status(pm25: number | null): AirStatus | null {
    if (pm25 === null) return null;
    if (pm25 > 35) return AirStatus.BAD;
    if (pm25 > 15) return AirStatus.MODERATE;
    return AirStatus.GOOD;
  }

  /** 오존(ppm): 0.09 이상 나쁨, 0.03 이상 보통, 미만 좋음 */
  ozoneStatus(ppm: number | null): AirStatus | null {
    if (ppm === null) return null;
    if (ppm >= 0.09) return AirStatus.BAD;
    if (ppm >= 0.03) return AirStatus.MODERATE;
    return AirStatus.GOOD;
  }

  /** 미세먼지(PM10): 80 초과 나쁨, 30 초과 보통, 이하 좋음 */
  pm10Status(pm10: number | null): AirStatus | null {
    if (pm10 === null) return null;
    if (pm10 > 80) return AirStatus.BAD;
    if (pm10 > 30) return AirStatus.MODERATE;
    return AirStatus.GOOD;
  }

  /** 통합대기환경지수(CAI): 100 초과 나쁨, 50 초과 보통, 이하 좋음 */
  caiStatus(cai: number | null): AirStatus | null {
    if (cai === null) return null;
    if (cai > 100) return AirStatus.BAD;
    if (cai > 50) return AirStatus.MODERATE;
    return AirStatus.GOOD;
  }
}
