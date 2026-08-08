import { Injectable, Logger } from '@nestjs/common';
import { OtpProvider } from './otp-provider.interface';

/**
 * 개발/테스트용 mock OTP provider.
 *
 * OTP policy: 개발 환경은 allowlisted test phone / mock OTP 사용.
 * - allowlisted 번호: 고정 코드 "123456" 발송 (로그만 출력)
 * - 그 외 번호: 무작위 6자리 코드 생성 후 로그만 출력 (실제 SMS 미발송)
 *
 * 운영(NODE_ENV=production)에서는 SmsOtpProvider로 교체해야 한다.
 */
@Injectable()
export class MockOtpProvider implements OtpProvider {
  private readonly logger = new Logger(MockOtpProvider.name);
  readonly name = 'mock';

  // 개발용 고정 OTP를 허용할 테스트 전화번호 목록 (쉼표 구분).
  // 환경변수 OTP_ALLOWLIST_PHONES로 주입. 비워두면 모두 무작위 코드.
  private readonly allowlisted: Set<string>;

  constructor() {
    // process.env 직접 읽기 (OtpService와 동일 사유).
    const raw = process.env.OTP_ALLOWLIST_PHONES ?? '';
    this.allowlisted = new Set(
      raw
        .split(',')
        .map((p) => p.trim().replace(/-/g, ''))
        .filter((p) => p.length > 0),
    );
  }

  async send(phoneNumber: string, code: string): Promise<void> {
    // 민감정보(전화번호)는 마스킹하여 로그에 남기지 않는다.
    // 실제 코드 값은 운영 로그에 노출되면 안 되지만, 개발 환경이므로
    // 디버깅 편의를 위해 마스킹 없이 출력한다 (production 비활성).
    this.logger.log(
      `[MOCK OTP] dev allowlisted=${this.allowlisted.has(phoneNumber)} -> code=${code}`,
    );
  }
}
