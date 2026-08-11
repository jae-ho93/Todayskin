import { Injectable, Logger } from '@nestjs/common';
import { OtpProvider } from './otp-provider.interface';

/**
 * 개발/테스트용 mock OTP provider (MO).
 *
 * OTP policy: 개발 환경은 allowlisted test phone / mock OTP 사용.
 * - allowlisted 번호: 고정 코드 "123456" (로그만 출력)
 * - 그 외 번호: 무작위 6자리 코드 (OtpService가 생성, 로그만 출력)
 *
 * MO 방식이지만 개발 환경에서는 실제 문자 수신이 없으므로
 * verifySent는 항상 true를 반환한다 — 코드 일치(해시 비교)만으로 검증 통과.
 * OCTOMO_API_KEY가 설정되면 otp.module이 OctomoOtpProvider로 교체한다.
 */
@Injectable()
export class MockOtpProvider implements OtpProvider {
  private readonly logger = new Logger(MockOtpProvider.name);
  readonly name = 'mock';
  // 개발 환경에서 표시용 — 실제 문자 발송은 없으므로 사용되지 않는다.
  // OCTOMO 대표번호와 동일하게 유지해 운영/개발 화면 안내가 일관되게 보인다.
  readonly recipientNumber = '1666-3538';

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

  /**
   * MO 검증 mock — 개발 환경에서는 실제 문자 수신 확인이 없으므로
   * 항상 true (코드 정합성은 OtpService의 해시 비교가 담당).
   */
  async verifySent(phoneNumber: string): Promise<boolean> {
    this.logger.log(
      `[MOCK OTP] verifySent phone=${this.maskPhone(phoneNumber)} allowlisted=${this.allowlisted.has(phoneNumber)} -> true`,
    );
    return true;
  }

  /** 로그에 전화번호를 마스킹해 남긴다 (중간 4자리 제거). */
  private maskPhone(phoneNumber: string): string {
    if (phoneNumber.length < 7) return '***';
    return `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}`;
  }
}
