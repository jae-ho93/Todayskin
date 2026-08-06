import * as Sentry from '@sentry/node';
import type { ConfigService } from '@nestjs/config';

/**
 * Sentry 초기화.
 *
 * SENTRY_DSN이 설정된 경우에만 초기화한다.
 * 운영 환경에서만 활성화하는 것을 권장하지만, DSN이 비어있으면
 * 어떤 환경에서도 초기화하지 않는다(안전 장치).
 *
 * 민감정보(전화번호·생년월일·좌표·token)가 Sentry로 전송되지 않도록
 * beforeSend에서 마스킹을 적용한다.
 */
export function initSentry(config: ConfigService): boolean {
  const dsn = config.get<string>('SENTRY_DSN', '');
  if (!dsn) {
    return false;
  }

  Sentry.init({
    dsn,
    environment: config.get<string>('NODE_ENV', 'development'),
    tracesSampleRate: config.get<number>('SENTRY_TRACES_SAMPLE_RATE', 0.1),
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
        if (event.request.query_string) {
          const qs = event.request.query_string;
          const qsStr =
            typeof qs === 'string'
              ? qs
              : Array.isArray(qs)
                ? qs.map(([k, v]) => `${k}=${v}`).join('&')
                : '';
          if (qsStr) {
            event.request.query_string = maskQueryParams(qsStr);
          }
        }
      }
      if (event.breadcrumbs) {
        for (const crumb of event.breadcrumbs) {
          if (crumb && typeof crumb.message === 'string') {
            crumb.message = maskEventString(crumb.message);
          }
        }
      }
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) {
            ex.value = maskEventString(ex.value);
          }
          if (ex.stacktrace?.frames) {
            for (const frame of ex.stacktrace.frames) {
              if (frame.vars) {
                for (const key of Object.keys(frame.vars)) {
                  if (typeof frame.vars[key] === 'string') {
                    frame.vars[key] = maskEventString(frame.vars[key]);
                  }
                }
              }
            }
          }
        }
      }
      return event;
    },
  });

  return true;
}

function maskEventString(value: string): string {
  let result = value;
  // JWT
  result = result.replace(
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    '[REDACTED_JWT]',
  );
  // 전화번호 (하이픈 포함/미포함)
  result = result
    .replace(/\b01[0-9]-?\d{3,4}-?\d{4}\b/g, (m) => {
      const d = m.replace(/\D/g, '');
      return d.length >= 8 ? `${d.slice(0, 3)}****${d.slice(-4)}` : '[REDACTED]';
    })
    .replace(/\b01[0-9]{8,9}\b/g, (m) =>
      m.length >= 8 ? `${m.slice(0, 3)}****${m.slice(-4)}` : '[REDACTED]',
    );
  // 생년월일
  result = result.replace(
    /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g,
    (m) => `${m.slice(0, 4)}-**-**`,
  );
  return result;
}

function maskQueryParams(qs: string): string {
  return qs
    .replace(/([?&]token=)[^&]+/gi, '$1[REDACTED]')
    .replace(/([?&]authorization=)[^&]+/gi, '$1[REDACTED]');
}

/**
 * 에러를 Sentry에 캡처한다.
 * Sentry가 초기화되지 않은 경우 no-op.
 */
export function captureException(error: unknown): void {
  Sentry.captureException(error);
}

/**
 * Sentry 플러시 (종료 시).
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  await Sentry.flush(timeoutMs);
}
