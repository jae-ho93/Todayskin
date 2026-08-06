import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpProvider } from './providers/otp-provider.interface';
import { OtpPurpose } from './enums/otp-purpose.enum';

/**
 * OTP 발송·검증 서비스.
 *
 * decision.md T3-04 결정에 따른 정책:
 * - 가입·새 디바이스 로그인에 OTP 필수 (운영 공개 전)
 * - 개발: allowlisted test phone / mock OTP
 * - 운영: 실제 OTP + 시도 횟수·만료·재전송 제한
 *
 * 제한 정책 (환경변수로 조정 가능):
 * - OTP_TTL_SECONDS: 코드 유효 시간. 기본 180초(3분).
 * - OTP_MAX_ATTEMPTS: 최대 검증 시도 횟수. 기본 5.
 * - OTP_RESEND_COOLDOWN_SECONDS: 재전송 대기 시간. 기본 60초.
 * - OTP_MAX_PENDING_PER_PHONE: 번호별 미검증 코드 최대 개수. 기본 3.
 *   초과 시 가장 오래된 코드를 폐기한다.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  private readonly ttlSeconds: number;
  private readonly maxAttempts: number;
  private readonly resendCooldownSeconds: number;
  private readonly maxPendingPerPhone: number;

  // 개발용 allowlisted 전화번호는 고정 OTP(123456)를 사용한다.
  private readonly allowlisted: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.ttlSeconds = this.config.get<number>('OTP_TTL_SECONDS', 180);
    this.maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS', 5);
    this.resendCooldownSeconds = this.config.get<number>(
      'OTP_RESEND_COOLDOWN_SECONDS',
      60,
    );
    this.maxPendingPerPhone = this.config.get<number>(
      'OTP_MAX_PENDING_PER_PHONE',
      3,
    );
    // process.env를 직접 읽는다. ConfigModule이 .env 우선 로드로
    // process.env 값을 반영하지 않는 환경(e2e)에서도 동작하도록.
    const rawAllow = process.env.OTP_ALLOWLIST_PHONES ?? '';
    this.allowlisted = new Set(
      rawAllow
        .split(',')
        .map((p) => p.trim().replace(/-/g, ''))
        .filter((p) => p.length > 0),
    );
  }

  /**
   * OTP 코드를 생성·저장·발송한다.
   * 재전송 제한을 검사하고, 미검증 코드 개수를 제한한다.
   */
  async sendOtp(
    phoneNumber: string,
    purpose: OtpPurpose,
    provider: OtpProvider,
  ): Promise<void> {
    const now = new Date();

    // 재전송 대기 시간 검사: 가장 최근 발송 코드의 sentAt 기준.
    const recent = await this.prisma.otpCode.findFirst({
      where: { phoneNumber, purpose, verified: false },
      orderBy: { sentAt: 'desc' },
    });
    if (recent) {
      const elapsedSec = (now.getTime() - recent.sentAt.getTime()) / 1000;
      if (elapsedSec < this.resendCooldownSeconds) {
        const wait = Math.ceil(this.resendCooldownSeconds - elapsedSec);
        throw new HttpException(
          `OTP 재전송은 ${wait}초 후 가능합니다`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // 미검증 코드가 너무 많으면 가장 오래된 것부터 폐기(verified=false 유지).
    const pending = await this.prisma.otpCode.findMany({
      where: { phoneNumber, purpose, verified: false },
      orderBy: { createdAt: 'asc' },
    });
    if (pending.length >= this.maxPendingPerPhone) {
      const toDelete = pending.slice(
        0,
        pending.length - this.maxPendingPerPhone + 1,
      );
      await this.prisma.otpCode.deleteMany({
        where: { id: { in: toDelete.map((c) => c.id) } },
      });
    }

    const code = this.generateCode(phoneNumber);
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    await this.prisma.otpCode.create({
      data: {
        phoneNumber,
        purpose,
        code,
        maxAttempts: this.maxAttempts,
        expiresAt,
        sentAt: now,
      },
    });

    try {
      await provider.send(phoneNumber, code);
    } catch {
      // 발송 실패 시 생성한 코드를 폐기해 검증에 사용되지 않게 한다.
      await this.prisma.otpCode.deleteMany({
        where: { phoneNumber, purpose, code },
      });
      this.logger.error(`OTP 발송 실패 (provider=${provider.name})`);
      throw new BadRequestException('OTP 발송에 실패했습니다');
    }
  }

  /**
   * OTP 코드를 검증한다. 성공 시 해당 코드를 verified=true로 전환하고
   * 동일 번호·용도의 다른 미검증 코드를 폐기한다.
   *
   * 검증 토큰(OTP가 검증되었음을 증명하는 단기 토큰)은 AuthService에서
   * 검증 완료 후 발급한다.
   */
  async verifyOtp(
    phoneNumber: string,
    purpose: OtpPurpose,
    inputCode: string,
  ): Promise<void> {
    const record = await this.prisma.otpCode.findFirst({
      where: { phoneNumber, purpose, verified: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new UnauthorizedException('OTP를 먼저 발송해 주세요');
    }

    if (record.expiresAt <= new Date()) {
      throw new UnauthorizedException('OTP가 만료되었습니다. 다시 발송해 주세요');
    }

    if (record.attempts >= record.maxAttempts) {
      throw new UnauthorizedException('OTP 시도 횟수를 초과했습니다');
    }

    // 시도 횟수 증가 — 코드 불일치 시에만 증가.
    if (record.code !== inputCode) {
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = record.maxAttempts - (record.attempts + 1);
      if (remaining <= 0) {
        throw new UnauthorizedException('OTP 시도 횟수를 초과했습니다');
      }
      throw new UnauthorizedException(
        `OTP가 일치하지 않습니다 (남은 시도: ${remaining})`,
      );
    }

   // 검증 성공: verified=true로 전환, 동일 번호·용도의 다른 미검증 코드 폐기.
    // Prisma 7: $transaction은 콜백 형식으로 원자성을 보장한다.
    await this.prisma.$transaction(async (tx) => {
      await tx.otpCode.update({
        where: { id: record.id },
        data: { verified: true },
      });
      await tx.otpCode.deleteMany({
        where: {
          phoneNumber,
          purpose,
          verified: false,
          id: { not: record.id },
        },
      });
    });
  }

  /**
   * 전화번호가 OTP 검증을 완료했는지 확인한다.
   * AuthService가 signup/login을 진행하기 전 호출한다.
   */
  async isVerified(
    phoneNumber: string,
    purpose: OtpPurpose,
  ): Promise<boolean> {
    const record = await this.prisma.otpCode.findFirst({
      where: { phoneNumber, purpose, verified: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) return false;

    // 검증 완료 후 일정 시간(기본 TTL * 2) 내에만 인정.
    // 가입/로그인 절차를 이어가는 창을 준다.
    const verifyWindowSec = this.ttlSeconds * 2;
    const cutoff = new Date(Date.now() - verifyWindowSec * 1000);
    return record.createdAt >= cutoff;
  }

  /**
   * 검증 완료 기록을 소비(삭제)한다. signup/login 성공 후 1회만 사용되도록.
   */
  async consumeVerification(
    phoneNumber: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    await this.prisma.otpCode.deleteMany({
      where: { phoneNumber, purpose, verified: true },
    });
  }

  /**
   * 6자리 OTP 코드 생성.
   * 개발 환경에서 allowlisted 번호는 고정값(123456)을 반환해
   * 실제 발송 없이도 검증 흐름을 테스트할 수 있게 한다.
   */
  private generateCode(phoneNumber: string): string {
    if (this.allowlisted.has(phoneNumber)) {
      return '123456';
    }
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }
}
