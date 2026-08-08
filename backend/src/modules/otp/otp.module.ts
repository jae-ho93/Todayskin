import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { OtpProvider, OTP_PROVIDER } from './providers/otp-provider.interface';
import { MockOtpProvider } from './providers/mock-otp.provider';
import { SmsOtpProvider } from './providers/sms-otp.provider';

/**
 * OTP 모듈.
 *
 * provider 선택:
 * - production: SmsOtpProvider (실제 SMS 게이트웨이 — 운영 공개 전 구현)
 * - 그외(dev/test): MockOtpProvider (로그만 출력)
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
        const isProd = config.get<string>('NODE_ENV') === 'production';
        return isProd ? new SmsOtpProvider(config) : new MockOtpProvider();
      },
    },
  ],
  exports: [OtpService, OTP_PROVIDER],
})
export class OtpModule {}
