import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OtpService } from './otp.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OTP_PROVIDER } from './providers/otp-provider.interface';
import type { OtpProvider } from './providers/otp-provider.interface';

/**
 * OTP 컨트롤러.
 *
 * decision.md T3-04: 가입·새 디바이스 로그인에 OTP 필수.
 * - POST /otp/send: 전화번호로 OTP 발송
 * - POST /otp/verify: OTP 코드 검증
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
  @ApiOperation({ summary: 'OTP 발송 (회원가입/로그인 본인확인)' })
  @HttpCode(200)
  async send(@Body() dto: SendOtpDto): Promise<{ message: string }> {
    const phoneNumber = dto.phoneNumber.replace(/-/g, '');
    await this.otpService.sendOtp(
      phoneNumber,
      dto.purpose,
      this.otpProvider,
    );
    return { message: 'OTP가 발송되었습니다' };
  }

  @Post('verify')
  @ApiOperation({ summary: 'OTP 검증' })
  @HttpCode(200)
  async verify(@Body() dto: VerifyOtpDto): Promise<{ message: string }> {
    const phoneNumber = dto.phoneNumber.replace(/-/g, '');
    await this.otpService.verifyOtp(phoneNumber, dto.purpose, dto.code);
    return { message: 'OTP 검증이 완료되었습니다' };
  }
}
