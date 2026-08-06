/**
 * 민감정보 마스킹 유틸리티.
 *
 * 로그 메시지에 전화번호·생년월일·좌표·JWT token이 문자열로 포함될 수 있다.
 * pino의 redact는 객체 필드만 처리하므로, 문자열 보간에 포함된 민감정보는
 * 이 유틸리티로 별도 마스킹한다.
 *
 * 마스킹 규칙:
 * - 전화번호: 01012345678 → 010****5678 (가운데 4자리)
 * - 생년월일(YYYY-MM-DD): 1990-01-01 → 1990-**-**
 * - JWT token: eyJ... (전체 [REDACTED])
 * - 좌표: 위도/경도 소수점 이후 마스킹
 */

const PHONE_PATTERN = /\b01[0-9]{8,9}\b/g;
const PHONE_DASH_PATTERN = /\b01[0-9]-?\d{3,4}-?\d{4}\b/g;
const BIRTHDATE_PATTERN = /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const COORD_PATTERN = /\b(-?\d{1,3}\.\d{4,})\b/g;

export function maskPhoneNumber(value: string): string {
  return value
    .replace(PHONE_DASH_PATTERN, (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length >= 8) {
        return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
      }
      return '[REDACTED]';
    })
    .replace(PHONE_PATTERN, (match) => {
      if (match.length >= 8) {
        return `${match.slice(0, 3)}****${match.slice(-4)}`;
      }
      return '[REDACTED]';
    });
}

export function maskBirthDate(value: string): string {
  return value.replace(BIRTHDATE_PATTERN, (match) => {
    const year = match.slice(0, 4);
    return `${year}-**-**`;
  });
}

export function maskJwtToken(value: string): string {
  return value.replace(JWT_PATTERN, '[REDACTED_JWT]');
}

export function maskCoordinates(value: string): string {
  return value.replace(COORD_PATTERN, (match) => {
    const neg = match.startsWith('-');
    const intPart = Math.floor(Math.abs(parseFloat(match)));
    return `${neg ? '-' : ''}${intPart}.[REDACTED]`;
  });
}

/**
 * 모든 마스킹 규칙을 순차 적용한다.
 * 로그 메시지 보간 전에 사용한다.
 */
export function maskSensitiveData(value: string): string {
  let result = value;
  result = maskJwtToken(result);
  result = maskPhoneNumber(result);
  result = maskBirthDate(result);
  result = maskCoordinates(result);
  return result;
}
