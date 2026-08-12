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
 * - API key: 쿼리스트링(?key=)과 인증 헤더 값(x-goog-api-key 등) 전체 [REDACTED]
 */

const PHONE_PATTERN = /\b01[0-9]{8,9}\b/g;
const PHONE_DASH_PATTERN = /\b01[0-9]-?\d{3,4}-?\d{4}\b/g;
const BIRTHDATE_PATTERN = /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const COORD_PATTERN = /\b(-?\d{1,3}\.\d{4,})\b/g;
// R2: 외부 API key가 URL이나 헤더 문자열로 로그에 섞여 들어오는 경로.
// 쿼리스트링(?key=/&api_key=)과 헤더 표기(x-goog-api-key: / authorization:)를 모두 덮는다.
const API_KEY_QUERY_PATTERN = /([?&](?:key|api[_-]?key|access_token)=)[^&\s"'&]+/gi;
const API_KEY_HEADER_PATTERN =
  /\b(x-goog-api-key|x-inference-key|api[_-]?key|authorization)(["']?\s*[:=]\s*["']?)(?:Bearer\s+|Octomo\s+)?[^\s"',}]+/gi;

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
 * R2: 외부 API key를 마스킹한다.
 * 쿼리스트링 형태(`?key=abc`)와 헤더 형태(`x-goog-api-key: abc`)를 모두 처리한다.
 */
export function maskApiKeys(value: string): string {
  return value
    .replace(API_KEY_QUERY_PATTERN, '$1[REDACTED]')
    .replace(API_KEY_HEADER_PATTERN, '$1$2[REDACTED]');
}

/**
 * 모든 마스킹 규칙을 순차 적용한다.
 * 로그 메시지 보간 전에 사용한다.
 */
export function maskSensitiveData(value: string): string {
  let result = value;
  result = maskApiKeys(result);
  result = maskJwtToken(result);
  result = maskPhoneNumber(result);
  result = maskBirthDate(result);
  result = maskCoordinates(result);
  return result;
}
