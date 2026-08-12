import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MessageResponseDto } from '../../common/dto/message-response.dto';
import { OtpService } from './otp.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { SendOtpResponseDto } from './dto/send-otp-response.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OTP_PROVIDER } from './providers/otp-provider.interface';
import type { OtpProvider } from './providers/otp-provider.interface';

/**
 * OTP 컨트롤러 (MO — Mobile Originated).
 *
 * OTP policy: 가입·새 디바이스 로그인에 OTP 필수.
 * - POST /otp/send: 인증코드 생성 → 응답에 code + recipientNumber 반환
 *   (MO: 화면에 표시해 사용자가 수신 번호로 문자를 보내게 안내)
 * - POST /otp/verify: 사용자가 보낸 문자의 실제 수신 여부로 검증
 *
 * OTP 검증 성공 후 signup/login은 기존 /auth/signup, /auth/login에서 진행한다.
 * AuthService가 OTP 검증 여부를 isVerified()로 확인한다.
 */
@ApiTags('otp')
@Controller('otp')
export class OtpController {
  constructor(
    private readonly otpService: OtpService,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
  ) {}

  @Post('send')
  @ApiOperation({ summary: 'OTP 챌린지 생성 (회원가입/로그인 본인확인 — MO)' })
  @ApiOkResponse({ type: SendOtpResponseDto })
  @HttpCode(200)
  async send(@Body() dto: SendOtpDto): Promise<SendOtpResponseDto> {
    const phoneNumber = dto.phoneNumber.replace(/-/g, '');
    const { code, recipientNumber } = await this.otpService.sendOtp(
      phoneNumber,
      dto.purpose,
      this.otpProvider,
    );
    return {
      code,
      recipientNumber,
      message: 'OTP가 발송되었습니다',
    };
  }

  @Post('verify')
  @ApiOperation({ summary: 'OTP 검증 (MO — 문자 수신 여부 확인)' })
  @ApiOkResponse({ type: MessageResponseDto })
  @HttpCode(200)
  async verify(@Body() dto: VerifyOtpDto): Promise<MessageResponseDto> {
    const phoneNumber = dto.phoneNumber.replace(/-/g, '');
    await this.otpService.verifyOtp(
      phoneNumber,
      dto.purpose,
      dto.code,
      this.otpProvider,
    );
    return { message: 'OTP 검증이 완료되었습니다' };
  }
}
