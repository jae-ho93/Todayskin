import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OtpModule } from '../otp/otp.module';
import { JwtKeyService } from './jwt-key.service';
import { SoftDeleteModule } from '../../common/soft-delete/soft-delete.module';

@Module({
  imports: [
    PassportModule,
    OtpModule,
    forwardRef(() => SoftDeleteModule),
    JwtModule.registerAsync({
      useFactory: () => ({
        // secret/expiresIn은 AuthService에서 ConfigService로 직접 관리.
        // 실제 서명/검증 시 secret을 명시적으로 전달한다.
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, JwtKeyService],
  exports: [AuthService, JwtModule, JwtKeyService],
})
export class AuthModule {}
