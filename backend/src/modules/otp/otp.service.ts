import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { maskSensitiveData } from '../../common/logging/redact.logger';
import { OtpGatewayError, OtpProvider } from './providers/otp-provider.interface';
import { OtpPurpose } from './enums/otp-purpose.enum';

/**
 * OTP 발송·검증 서비스.
 *
 * OTP policy:
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
 * - OTP_DAILY_LIMIT_PER_PHONE: 번호별 하루(KST 자정 기준) 최대 발송 횟수. 기본 10.
 *   allowlisted 개발 번호는 예외. SMS 도배 방지용 글로벌 제한 (N22).
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  private readonly ttlSeconds: number;
  private readonly maxAttempts: number;
  private readonly resendCooldownSeconds: number;
  private readonly maxPendingPerPhone: number;
  private readonly dailyLimitPerPhone: number;

  // 개발용 allowlisted 전화번호는 고정 OTP(123456)를 사용한다.
  private readonly allowlisted: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.ttlSeconds = this.config.get<number>('OTP_TTL_SECONDS', 180);
    this.maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS', 5);
    this.maxPendingPerPhone = this.config.get<number>(
      'OTP_MAX_PENDING_PER_PHONE',
      3,
    );
    // process.env를 우선 읽는다. ConfigModule이 import 시점에 env를 검증·캐시해서
    // e2e 등 모듈 생성 후 변경된 process.env 값을 ConfigService가 반영하지 못하기 때문.
    // (allowlist도 같은 이유로 process.env 직접 읽기 패턴을 사용한다)
    // 빈 문자열·비숫자 값이 제한을 조용히 해제하지 않도록 Number.isFinite로 방어한다.
    this.resendCooldownSeconds = parsePositiveInt(
      process.env.OTP_RESEND_COOLDOWN_SECONDS ??
        this.config.get<number>('OTP_RESEND_COOLDOWN_SECONDS', 60),
      60,
    );
    this.dailyLimitPerPhone = parsePositiveInt(
      process.env.OTP_DAILY_LIMIT_PER_PHONE ??
        this.config.get<number>('OTP_DAILY_LIMIT_PER_PHONE', 10),
      10,
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

    // N22: 번호별 하루 발송 글로벌 제한 (KST 자정 기준). allowlisted 개발 번호는 예외.
    // IP 기반 rate limit과 별개로, 공격자가 IP를 바꿔가며 SMS를 도배하는 것을 막는다.
    if (!this.allowlisted.has(phoneNumber) && this.dailyLimitPerPhone > 0) {
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const kstDayStart = new Date(
        Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) -
          9 * 60 * 60 * 1000,
      );
      // otp_send_logs 기준 집계 — otp_codes row 수는 maxPending 프루닝으로
      // 줄어들어 한도가 우회되므로 사용하지 않는다 (리뷰 반영).
      const sentToday = await this.prisma.otpSendLog.count({
        where: { phoneNumber, sentAt: { gte: kstDayStart } },
      });
      if (sentToday >= this.dailyLimitPerPhone) {
        this.logger.warn(
          `OTP daily limit reached phone=${this.maskPhone(phoneNumber)} sentToday=${sentToday}`,
        );
        throw new HttpException(
          '하루 발송 가능한 OTP 횟수를 초과했습니다. 내일 다시 시도해주세요.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

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

    // N22: 코드는 평문이 아닌 SHA-256(salt + code) 해시로 저장한다.
    // provider.send에는 발송용 원문 코드만 전달한다.
    const { code, salt } = this.generateCodeWithSalt(phoneNumber);
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    await this.prisma.otpCode.create({
      data: {
        phoneNumber,
        purpose,
        codeHash: hashOtpCode(salt, code),
        salt,
        maxAttempts: this.maxAttempts,
        expiresAt,
        sentAt: now,
      },
    });

    try {
      await provider.send(phoneNumber, code);
    } catch (e) {
      // 발송 실패 시 생성한 코드를 폐기해 검증에 사용되지 않게 한다.
      // (방금 생성한 코드만 폐기 — 동일 번호·용도의 다른 코드는 건드리지 않음)
      await this.prisma.otpCode.deleteMany({
        where: { phoneNumber, purpose, codeHash: hashOtpCode(salt, code) },
      });
      // N9: 게이트웨이 자체 문제(설정 누락·HTTP 오류·네트워크 장애)는 서버 측 오류이므로
      // 503으로 매핑한다 — 클라이언트 입력 문제(400)와 구분한다. 가짜 성공은 절대 금지.
      if (e instanceof OtpGatewayError) {
        this.logger.error(`OTP 발송 실패 (provider=${provider.name}): ${e.name}`);
        throw new ServiceUnavailableException(
          'OTP 발송 서비스에 문제가 있어요. 잠시 후 다시 시도해주세요.',
        );
      }
      this.logger.error(`OTP 발송 실패 (provider=${provider.name})`);
      throw new BadRequestException('OTP 발송에 실패했습니다');
    }

    // N22: 발송 성공 시 전용 로그 기록 — 일일 한도 집계 기반.
    // provider.send 성공 후에만 기록되므로 한도가 정확히 집계된다.
    // 로그 기록 실패는 발송 자체(이미 성공한 SMS)를 실패로 만들지 않도록
    // 비치명적으로 처리한다. (실패 시 코드 폐기로 이어지면 수신자는 받은
    // 코드를 쓸 수 없게 된다)
    try {
      await this.prisma.otpSendLog.create({
        data: { phoneNumber, purpose, sentAt: now },
      });
    } catch (logErr) {
      // 발송 로그 기록 실패는 발송 자체를 실패로 만들지 않는다.
      // 실패 원인(DB 오류 등)을 남겨 일일 한도 집계 누락을 디버깅할 수 있게 하되,
      // 전화번호 등 민감정보가 로그에 남지 않도록 마스킹한다 (N9 로그 정책).
      this.logger.warn(
        `OTP 발송 로그 기록 실패 (provider=${provider.name}) — 일일 한도 집계 누락 가능: ${maskSensitiveData(
          logErr instanceof Error ? logErr.message : String(logErr),
        )}`,
      );
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

    // 시도 횟수 증가 — 코드 불일치 시에만 증가. (N22: 해시 비교)
    // attempts < maxAttempts 조건부 updateMany로 동시 검증 요청이
    // maxAttempts를 넘겨 한도를 우회하지 못하게 원자적으로 막는다.
    if (hashOtpCode(record.salt, inputCode) !== record.codeHash) {
      const updated = await this.prisma.otpCode.updateMany({
        where: { id: record.id, attempts: { lt: record.maxAttempts } },
        data: { attempts: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new UnauthorizedException('OTP 시도 횟수를 초과했습니다');
      }
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
   * 6자리 OTP 코드 + 코드별 무작위 salt 생성.
   * 개발 환경에서 allowlisted 번호는 고정값(123456)을 반환해
   * 실제 발송 없이도 검증 흐름을 테스트할 수 있게 한다.
   */
  private generateCodeWithSalt(phoneNumber: string): { code: string; salt: string } {
    const code = this.allowlisted.has(phoneNumber)
      ? '123456'
      : String(randomInt(0, 1_000_000)).padStart(6, '0');
    return { code, salt: randomBytes(16).toString('hex') };
  }

  /** 로그에 전화번호를 마스킹해 남긴다 (중간 4자리 제거). */
  private maskPhone(phoneNumber: string): string {
    if (phoneNumber.length < 7) return '***';
    return `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}`;
  }
}

/** SHA-256(salt + code) — N22 OTP 코드 해시. */
function hashOtpCode(salt: string, code: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

/**
 * 환경변수 값을 안전하게 양의 정수로 파싱한다.
 * 빈 문자열(Number('')=0)·공백·비숫자(Number('abc')=NaN)가 제한을
 * 조용히 해제/왜곡하지 않도록, 유효하지 않으면 기본값을 반환한다.
 * (0은 min(0) 정책상 유효한 값이므로 '0'은 그대로 허용한다)
 */
function parsePositiveInt(raw: unknown, fallback: number): number {
  if (raw === null || raw === undefined) return fallback;
  const s = String(raw).trim();
  if (s === '') return fallback;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}
