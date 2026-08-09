import { ApiProperty } from '@nestjs/swagger';

/**
 * OTP 챌린지 생성 응답 DTO (MO — Mobile Originated).
 *
 * MO 방식은 서비스가 문자를 발송하지 않으므로, 인증코드를 앱 화면에 표시해
 * 사용자가 recipientNumber로 문자를 보내게 안내한다. 따라서 응답에 코드가
 * 포함되는 것이 설계상 필수다. 코드 유효 시간(OTP_TTL_SECONDS)이 짧고,
 * 검증은 해당 번호에서 실제 문자를 보냈는지(provider.verifySent)로 확인되므로
 * 코드 노출 자체가 인증 우회로 이어지지 않는다.
 */
export class SendOtpResponseDto {
  @ApiProperty({ example: '123456', description: '화면에 표시할 인증코드 (MO)' })
  code!: string;

  @ApiProperty({ example: '1666-3538', description: '인증문자를 보낼 수신 번호 (MO)' })
  recipientNumber!: string;

  @ApiProperty({ example: 'OTP가 발송되었습니다' })
  message!: string;
}
