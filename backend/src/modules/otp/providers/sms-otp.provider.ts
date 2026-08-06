import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpProvider } from './otp-provider.interface';

/**
 * 운영용 SMS/알림톡 OTP provider.
 *
 * decision.md T3-04: 운영은 실제 OTP 발송.
 * 발송 채널은 SMS/알림톡 중 선택 — 현재는 SMS 게이트웨이 HTTP 호출 기반.
 * 실제 게이트웨이 연동 시 SMS_API_KEY, SMS_SENDER, SMS_ENDPOINT 환경변수 필요.
 *
 * 구현 시점: 운영 공개 전 게이트웨이 확정 후. 지금은 인터페이스와
 * 환경변수만 준비해 MockOtpProvider와 교체 가능한 상태로 둔다.
 * 키가 없으면 에러를 던져 운영에서 mock이 조용히 동작하지 않게 한다.
 */
@Injectable()
export class SmsOtpProvider implements OtpProvider {
  private readonly logger = new Logger(SmsOtpProvider.name);
  readonly name = 'sms';

  private readonly apiKey: string | undefined;
  private readonly sender: string | undefined;
  private readonly endpoint: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('SMS_API_KEY');
    this.sender = this.config.get<string>('SMS_SENDER');
    this.endpoint = this.config.get<string>('SMS_ENDPOINT');
  }

  async send(phoneNumber: string, code: string): Promise<void> {
    // 인터페이스 계약 유지. 게이트웨이 연동 전이라 파라미터는 의도적으로 미사용.
    void phoneNumber;
    void code;
    if (!this.apiKey || !this.sender || !this.endpoint) {
      this.logger.error(
        'SMS 게이트웨이 설정이 누락되었습니다 (SMS_API_KEY/SMS_SENDER/SMS_ENDPOINT)',
      );
      throw new Error('SMS OTP 게이트웨이 설정이 누락되었습니다');
    }

    // 실제 게이트웨이 연동은 운영 공개 전 구현.
    // 현재는 인터페이스 계약만 보장. 운영 진입 시 fetch/axios로 교체.
    this.logger.log(`[SMS OTP] 발송 예정 (게이트웨이 연동 전)`);

    // TODO(운영 공개 전): 실제 SMS 게이트웨이 HTTP 호출 구현.
    // - timeout·재시도·실패 로깅
    // - 전화번호는 로그에 남기지 않음
    throw new Error('SMS OTP 게이트웨이가 아직 구현되지 않았습니다');
  }
}
