/**
 * OTP 발송 채널 추상화.
 *
 * decision.md T3-04: 운영 공개 전까지 OTP 필수.
 * 개발: allowlisted test phone / mock OTP (MockOtpProvider)
 * 운영: 실제 SMS/알림톡 (SmsOtpProvider) + 시도 횟수·만료·재전송 제한
 *
 * 발송 제한(시도 횟수·만료·재전송 간격)은 OtpService에서 관리하고,
 * provider는 실제 발송(또는 mock)만 담당한다.
 */
export interface OtpProvider {
  /**
   * OTP 코드를 발송한다.
   * @param phoneNumber 정규화된 전화번호 (하이픈 제거)
   * @param code 6자리 OTP 코드
   * @returns 발송 성공 여부
   */
  send(phoneNumber: string, code: string): Promise<void>;

 /**
  * provider 이름 (로깅/식별용)
  */
 readonly name: string;
}
/**
 * OTP 발송 채널 추상화.
 *
 * decision.md T3-04: 운영 공개 전까지 OTP 필수.
 * 개발: allowlisted test phone / mock OTP (MockOtpProvider)
 * 운영: 실제 SMS/알림톡 (SmsOtpProvider) + 시도 횟수·만료·재전송 제한
 *
 * 발송 제한(시도 횟수·만료·재전송 간격)은 OtpService에서 관리하고,
 * provider는 실제 발송(또는 mock)만 담당한다.
 */
export interface OtpProvider {
  /**
   * OTP 코드를 발송한다.
   * @param phoneNumber 정규화된 전화번호 (하이픈 제거)
   * @param code 6자리 OTP 코드
   * @returns 발송 성공 여부
   */
  send(phoneNumber: string, code: string): Promise<void>;

  /**
   * provider 이름 (로깅/식별용)
   */
  readonly name: string;
}

/**
 * DI 토큰. 인터페이스는 런타임 값이 아니므로 Symbol 토큰으로 주입한다.
 */
export const OTP_PROVIDER = Symbol('OTP_PROVIDER');
