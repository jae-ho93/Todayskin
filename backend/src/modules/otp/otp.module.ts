import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { OtpProvider, OTP_PROVIDER } from './providers/otp-provider.interface';
import { MockOtpProvider } from './providers/mock-otp.provider';
import { OctomoOtpProvider } from './providers/octomo-otp.provider';

/**
 * OTP 모듈 (MO — Mobile Originated).
 *
 * provider 선택:
 * - OCTOMO_API_KEY 설정 시: OctomoOtpProvider (OCTOMO MO 인증 — 문자 수신 여부 검증)
 * - 그외(키 미설정): MockOtpProvider (allowlisted 고정 OTP)
 *
 * OTP policy: 개발은 allowlisted test phone / mock OTP,
 * 운영은 실제 OTP + 시도/만료/재전송 제한.
 */
@Module({
  imports: [ConfigModule],
  controllers: [OtpController],
  providers: [
    OtpService,
    {
      provide: OTP_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): OtpProvider => {
        const apiKey = config.get<string>('OCTOMO_API_KEY');
        return apiKey ? new OctomoOtpProvider(config) : new MockOtpProvider();
      },
    },
  ],
  exports: [OtpService, OTP_PROVIDER],
})
export class OtpModule {}
