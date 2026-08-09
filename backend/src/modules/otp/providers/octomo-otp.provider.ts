import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskSensitiveData } from '../../../common/logging/redact.logger';
import { OtpGatewayError, OtpProvider } from './otp-provider.interface';

/**
 * 운영용 OTP provider — OCTOMO MO 인증 API 연동.
 *
 * MO(Mobile Originated): 서비스가 문자를 발송하지 않고, 사용자가 안내된
 * 수신 번호로 인증코드를 문자 발송하면 수신 여부를 API로 조회해 검증한다.
 *
 * - 엔드포인트: POST {OCTOMO_ENDPOINT} (기본 https://api.octoverse.kr/octomo/v1/public/message/exists)
 * - 인증: Authorization 헤더 `Octomo {OCTOMO_API_KEY}`
 * - 요청: JSON { mobileNum, text } — withinMinutes(기본 5분) 이내 수신 확인
 * - 응답: { verified: boolean } — 수신 확인 시 true
 * - 수신 번호: OCTOMO_RECIPIENT_NUMBER (기본 1666-3538)
 *
 * 설정이 없으면 fail-closed(오류 throw)라 운영에서 mock이 조용히 동작하지 않는다.
 * 전화번호·OTP 코드·API key는 로그/오류 메시지에 절대 포함하지 않는다.
 */
@Injectable()
export class OctomoOtpProvider implements OtpProvider {
  private readonly logger = new Logger(OctomoOtpProvider.name);
  readonly name = 'octomo';

  private readonly apiKey: string | undefined;
  private readonly endpoint: string | undefined;
  /** 사용자가 문자를 보낼 수신 번호 (MO — 화면 안내용). */
  readonly recipientNumber: string;
  private readonly timeoutMs: number;
  /** 총 시도 횟수(네트워크 오류 한정 재시도 포함). 기본 2회 = 1회 재시도. */
  private readonly maxAttempts: number;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('OCTOMO_API_KEY');
    this.endpoint =
      this.config.get<string>('OCTOMO_ENDPOINT') ??
      'https://api.octoverse.kr/octomo/v1/public/message/exists';
    this.recipientNumber =
      this.config.get<string>('OCTOMO_RECIPIENT_NUMBER') ?? '1666-3538';
    this.timeoutMs = Number(this.config.get<number>('OCTOMO_TIMEOUT_MS', 10_000));
    // 네트워크 오류 재시도 횟수(OCTOMO_MAX_RETRIES) + 첫 시도. 상한 3회.
    const retries = Math.max(
      0,
      Math.min(Number(this.config.get<number>('OCTOMO_MAX_RETRIES', 1)), 2),
    );
    this.maxAttempts = retries + 1;
  }

  async verifySent(phoneNumber: string, text: string): Promise<boolean> {
    // 1. 설정 검증 — 누락 시 fail-closed.
    if (!this.apiKey || !this.endpoint) {
      this.logger.error('OCTOMO 게이트웨이 설정이 누락되었습니다 (OCTOMO_API_KEY)');
      throw new OtpGatewayError('OTP 인증 게이트웨이 설정이 누락되었습니다');
    }

    // 2. OCTOMO exists API 요청. mobileNum은 010 11자리(하이픈 제거)여야 한다.
    const body = JSON.stringify({ mobileNum: phoneNumber, text });

    // 3. 네트워크 오류(연결 실패/timeout)에 한해 제한 재시도.
    //    HTTP 오류 응답이나 API 거부는 재시도하지 않는다 — 키 오류 등은
    //    재시도로 해결되지 않으며, 조회 실패를 방치하지 않기 위함.
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Octomo ${this.apiKey}`,
          },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
          // 상태 코드만 로깅(응답 본문에 민감정보가 포함될 수 있어 원문은 남기지 않음).
          this.logger.error(`OCTOMO 게이트웨이 HTTP 오류: ${res.status}`);
          throw new OtpGatewayError('OTP 인증 게이트웨이가 오류 응답을 반환했습니다');
        }

        const data = (await res.json().catch(() => null)) as {
          verified?: unknown;
          message?: unknown;
        } | null;
        // verified=false는 오류가 아니라 "아직 수신 안 됨"이다 — false 반환.
        if (typeof data?.verified === 'boolean') {
          return data.verified;
        }

        // 예상하지 못한 응답 형태 — 서버 측 오류로 처리(가짜 성공 금지).
        const reason = typeof data?.message === 'string' ? maskSensitiveData(data.message) : '';
        this.logger.error(
          `OCTOMO 응답 형식 오류 (verified 누락${reason ? `, message=${reason}` : ''})`,
        );
        throw new OtpGatewayError('OTP 인증 게이트웨이 응답이 올바르지 않습니다');
      } catch (e) {
        if (e instanceof OtpGatewayError) {
          throw e;
        }
        // 네트워크 오류(연결 실패·timeout) — 제한 재시도 후 최종 실패.
        lastError = e;
        this.logger.warn(`OCTOMO 네트워크 오류 (시도 ${attempt}/${this.maxAttempts})`);
        if (attempt < this.maxAttempts) {
          await sleep(RETRY_BACKOFF_MS * attempt);
        }
      }
    }

    this.logger.error('OCTOMO 게이트웨이 연결 실패 (재시도 소진)');
    throw new OtpGatewayError(
      `OTP 인증 게이트웨이 연결에 실패했습니다: ${errorName(lastError)}`,
    );
  }
}

const RETRY_BACKOFF_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorName(e: unknown): string {
  return e instanceof Error ? e.name : String(e);
}
