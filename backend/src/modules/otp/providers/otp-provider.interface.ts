/**
 * OTP 발송 채널 추상화 (MO — Mobile Originated).
 *
 * OTP policy: 운영 공개 전까지 OTP 필수.
 * 개발: allowlisted test phone / mock OTP (MockOtpProvider)
 * 운영: OCTOMO(MO 인증) 기반 — 사용자가 직접 문자를 보내면 수신 여부를 API로 검증.
 *
 * MT(서비스가 문자 발송)와 달리 MO는 서비스가 문자를 발송하지 않는다.
 * - 인증코드는 응답으로 반환해 앱 화면에 표시하고,
 * - 사용자가 안내된 수신 번호로 해당 코드를 문자 발송하면,
 * - provider.verifySent()가 실제 수신 여부를 조회해 검증한다.
 *
 * 발송 제한(시도 횟수·만료·재전송 간격)은 OtpService에서 관리하고,
 * provider는 MO 채널 검증만 담당한다.
 */
export interface OtpProvider {
  /**
   * 사용자가 인증문자를 보낼 수신 번호 (MO — 화면 안내용).
   * 예: OCTOMO 대표번호 1666-3538
   */
  readonly recipientNumber: string;

  /**
   * 사용자가 보낸 문자가 실제 수신됐는지 검증한다 (MO).
   * @param phoneNumber 정규화된 전화번호 (하이픈 제거)
   * @param text 사용자에게 표시된 인증코드 (문자 본문과 정확히 일치해야 함)
   * @returns 최근 조회 범위 내 수신 확인 여부
   */
  verifySent(phoneNumber: string, text: string): Promise<boolean>;

  /**
   * provider 이름 (로깅/식별용)
   */
  readonly name: string;
}

/**
 * DI 토큰. 인터페이스는 런타임 값이 아니므로 Symbol 토큰으로 주입한다.
 */
export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

/**
 * MO 게이트웨이 자체의 장애/거부를 나타내는 오류.
 *
 * 검증 서비스(설정 누락·HTTP 오류·API 거부·네트워크 장애) 문제를 호출부가
 * 클라이언트 입력 오류(400)와 구분해 5xx로 응답하도록 하기 위한 타입이다.
 * 전화번호·OTP 코드·API key는 절대 message에 포함하지 않는다.
 */
export class OtpGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpGatewayError';
  }
}
