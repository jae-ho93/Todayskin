import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskSensitiveData } from '../../../common/logging/redact.logger';
import { OtpGatewayError, OtpProvider } from './otp-provider.interface';

/**
 * 운영용 SMS OTP provider — 알리고(Aligo) 문자 발송 API 연동.
 *
 * N9: SMS provider 확정(알리고) + 실제 HTTP 발송 구현.
 * - 엔드포인트: POST {SMS_ENDPOINT} (기본 https://apis.aligo.in/send/)
 * - 인증: form body의 key(SMS_API_KEY) + user_id(SMS_USER_ID)
 * - 발신 번호: SMS_SENDER, 수신 번호: receiver, 메시지: msg
 * - 성공 판별: 응답 JSON의 result_code > 0 (실패 시 음수)
 *
 * 설정이 없으면 fail-closed(오류 throw)라 운영에서 mock이 조용히 동작하지 않는다.
 * 전화번호·OTP 코드·API key는 로그/오류 메시지에 절대 포함하지 않는다.
 */
@Injectable()
export class SmsOtpProvider implements OtpProvider {
  private readonly logger = new Logger(SmsOtpProvider.name);
  readonly name = 'sms';

  private readonly apiKey: string | undefined;
  private readonly userId: string | undefined;
  private readonly sender: string | undefined;
  private readonly endpoint: string | undefined;
  /** testmode_yn=Y 전송 여부 — 실제 과금/발송 없이 연동 테스트만 수행. */
  private readonly testMode: boolean;
  private readonly timeoutMs: number;
  /** 총 시도 횟수(네트워크 오류 한정 재시도 포함). 기본 2회 = 1회 재시도. */
  private readonly maxAttempts: number;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('SMS_API_KEY');
    this.userId = this.config.get<string>('SMS_USER_ID');
    this.sender = this.config.get<string>('SMS_SENDER');
    this.endpoint = this.config.get<string>('SMS_ENDPOINT');
    this.testMode = this.config.get<string>('SMS_TESTMODE', '') === 'Y';
    this.timeoutMs = Number(this.config.get<number>('SMS_TIMEOUT_MS', 10_000));
    // 네트워크 오류 재시도 횟수(SMS_MAX_RETRIES) + 첫 시도. 상한 3회.
    const retries = Math.max(0, Math.min(Number(this.config.get<number>('SMS_MAX_RETRIES', 1)), 2));
    this.maxAttempts = retries + 1;
  }

  async send(phoneNumber: string, code: string): Promise<void> {
    // 1. 설정 검증 — 누락 시 fail-closed.
    if (!this.apiKey || !this.userId || !this.sender || !this.endpoint) {
      this.logger.error(
        'SMS 게이트웨이 설정이 누락되었습니다 (SMS_API_KEY/SMS_USER_ID/SMS_SENDER/SMS_ENDPOINT)',
      );
      throw new OtpGatewayError('SMS OTP 게이트웨이 설정이 누락되었습니다');
    }

    // 2. 알리고 form-encoded 요청 구성. 수신 번호는 하이픈 제거 상태로 전달된다.
    const body = new URLSearchParams({
      key: this.apiKey,
      user_id: this.userId,
      sender: this.sender,
      receiver: phoneNumber,
      // 90바이트 이하(SMS 타입) 유지 — 한글 3바이트 기준 안전한 길이.
      msg: `[Todayskin] 인증번호 ${code}을 입력해 주세요.`,
      msg_type: 'SMS',
      ...(this.testMode ? { testmode_yn: 'Y' } : {}),
    });

    // 3. 네트워크 오류(연결 실패/timeout)에 한해 제한 재시도.
    //    HTTP 오류 응답이나 API 거부(result_code<0)는 재시도하지 않는다 — OTP 중복 발송 방지.
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
          // 상태 코드만 로깅(응답 본문에 민감정보가 포함될 수 있어 원문은 남기지 않음).
          this.logger.error(`SMS 게이트웨이 HTTP 오류: ${res.status}`);
          throw new OtpGatewayError('SMS 게이트웨이가 오류 응답을 반환했습니다');
        }

        const data = (await res.json().catch(() => null)) as
          | { result_code?: unknown; message?: unknown }
          | null;
        const resultCode = Number(data?.result_code);
        if (Number.isFinite(resultCode) && resultCode > 0) {
          return;
        }

        // API 거부(음수 result_code) — 사용자에게 줄 사유는 노출하지 않고 서버 로그만 남긴다.
        // 게이트웨이가 수신 번호를 에코할 수 있으므로 원문은 마스킹해서 기록한다.
        const reason = typeof data?.message === 'string' ? maskSensitiveData(data.message) : '';
        this.logger.error(
          `SMS 발송 거부 (result_code=${String(data?.result_code)}${reason ? `, message=${reason}` : ''})`,
        );
        throw new OtpGatewayError('SMS 발송이 거부되었습니다');
      } catch (e) {
        if (e instanceof OtpGatewayError) {
          throw e;
        }
        // 네트워크 오류(연결 실패·timeout) — 제한 재시도 후 최종 실패.
        lastError = e;
        this.logger.warn(`SMS 네트워크 오류 (시도 ${attempt}/${this.maxAttempts})`);
        if (attempt < this.maxAttempts) {
          await sleep(RETRY_BACKOFF_MS * attempt);
        }
      }
    }

    this.logger.error('SMS 게이트웨이 연결 실패 (재시도 소진)');
    throw new OtpGatewayError(
      `SMS 게이트웨이 연결에 실패했습니다: ${errorName(lastError)}`,
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
