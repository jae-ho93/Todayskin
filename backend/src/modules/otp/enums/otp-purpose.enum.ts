/**
 * OTP 용도.
 * signup: 회원가입 시 전화번호 본인확인
 * login: 새 디바이스 로그인 시 본인확인
 * social_link: N33 소셜 계정에 전화번호 연결 시 본인확인
 */
export enum OtpPurpose {
  SIGNUP = 'signup',
  LOGIN = 'login',
  SOCIAL_LINK = 'social_link',
}
