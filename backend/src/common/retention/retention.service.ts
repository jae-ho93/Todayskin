import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * R11: append-only 테이블 보존 정책.
 *
 * `RefreshSession`·`AsyncJob`·`AiCallReservation`·`WeatherSnapshot`·`OtpCode`·
 * `OtpSendLog`는 계속 쌓이기만 하고 지우는 주체가 없었다(기존 purge는 탈퇴 사용자만
 * 처리한다). 테이블이 커지면 디스크와 백업 비용은 물론, dedupe 조회처럼 최근 행만
 * 보는 쿼리까지 같이 느려진다.
 *
 * **되돌릴 수 없는 DELETE이므로 기본값은 `off`다.** 운영에서 `RETENTION_SWEEP_MODE`를
 * `dry-run`으로 켜서 삭제 대상 규모를 로그로 확인하고, RDS 스냅샷을 확보한 뒤
 * `delete`로 올린다(docs/guides/DEPLOYMENT.md).
 */
export type RetentionMode = 'off' | 'dry-run' | 'delete';

export interface RetentionSweepResult {
  mode: RetentionMode;
  /** 테이블별 삭제(또는 dry-run 대상) 행 수. */
  tables: Record<string, number>;
  /** 배치 상한에 걸려 남은 행이 있는 테이블 — 다음 tick에서 이어서 지운다. */
  truncated: string[];
}

interface RetentionPolicy {
  /** 로그·결과 키. */
  name: string;
  /** 보존 기간 환경변수. */
  envKey: string;
  defaultDays: number;
  /** cutoff 이전 행을 찾는 Prisma where. */
  where: (cutoff: Date) => Record<string, unknown>;
  count: (where: Record<string, unknown>) => Promise<number>;
  /** id 목록으로 삭제 — 배치 크기를 제한해 긴 잠금을 피한다. */
  deleteBatch: (where: Record<string, unknown>, take: number) => Promise<number>;
}

/** 한 tick에서 테이블당 지울 최대 행 수(배치 × 반복 상한). */
const MAX_BATCHES_PER_TABLE = 20;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  mode(): RetentionMode {
    const raw = (this.config.get<string>('RETENTION_SWEEP_MODE') ?? 'off').trim();
    return raw === 'dry-run' || raw === 'delete' ? raw : 'off';
  }

  private batchSize(): number {
    const raw = Number(this.config.get<number>('RETENTION_BATCH_SIZE') ?? 1_000);
    return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 10_000) : 1_000;
  }

  private days(policy: RetentionPolicy): number {
    const raw = Number(this.config.get<number>(policy.envKey) ?? policy.defaultDays);
    return Number.isFinite(raw) && raw > 0 ? raw : policy.defaultDays;
  }

  /**
   * 모든 정책을 순회한다. 한 테이블이 실패해도 나머지는 계속 진행한다
   * (정리 작업이 서로를 막지 않게 한다).
   */
  async sweep(now: Date = new Date()): Promise<RetentionSweepResult> {
    const mode = this.mode();
    const result: RetentionSweepResult = { mode, tables: {}, truncated: [] };
    if (mode === 'off') return result;

    const batchSize = this.batchSize();

    for (const policy of this.policies()) {
      const cutoff = new Date(now.getTime() - this.days(policy) * 86_400_000);
      const where = policy.where(cutoff);
      try {
        if (mode === 'dry-run') {
          result.tables[policy.name] = await policy.count(where);
          continue;
        }
        let deleted = 0;
        for (let i = 0; i < MAX_BATCHES_PER_TABLE; i++) {
          const n = await policy.deleteBatch(where, batchSize);
          deleted += n;
          if (n < batchSize) break;
          if (i === MAX_BATCHES_PER_TABLE - 1) result.truncated.push(policy.name);
        }
        result.tables[policy.name] = deleted;
      } catch (e) {
        this.logger.error(
          `retention sweep failed for ${policy.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    this.logger.log(`retention_sweep ${JSON.stringify(result)}`);
    return result;
  }

  private policies(): RetentionPolicy[] {
    const prisma = this.prisma;
    return [
      {
        // 만료된 세션은 인증에 쓰일 수 없다. revoke된 세션은 재사용 탐지(R21)를
        // 위해 잠시 남겨야 하므로 같은 기간을 두 조건에 적용한다.
        name: 'refreshSession',
        envKey: 'RETENTION_REFRESH_SESSION_DAYS',
        defaultDays: 7,
        where: (cutoff) => ({
          OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
        }),
        count: (where) => prisma.refreshSession.count({ where }),
        deleteBatch: (where, take) =>
          deleteByIds(
            () => prisma.refreshSession.findMany({ where, select: { id: true }, take }),
            (ids) => prisma.refreshSession.deleteMany({ where: { id: { in: ids } } }),
          ),
      },
      {
        // 진행 중(PENDING) job은 지우지 않는다 — 워커가 아직 집어들 수 있다.
        name: 'asyncJob',
        envKey: 'RETENTION_ASYNC_JOB_DAYS',
        defaultDays: 30,
        where: (cutoff) => ({
          status: { in: ['COMPLETED', 'FAILED'] },
          createdAt: { lt: cutoff },
        }),
        count: (where) => prisma.asyncJob.count({ where }),
        deleteBatch: (where, take) =>
          deleteByIds(
            () => prisma.asyncJob.findMany({ where, select: { id: true }, take }),
            (ids) => prisma.asyncJob.deleteMany({ where: { id: { in: ids } } }),
          ),
      },
      {
        // 완료된 in-flight 예약은 결과 재반환 창이 지나면 쓸모가 없다.
        name: 'aiCallReservation',
        envKey: 'RETENTION_AI_RESERVATION_DAYS',
        defaultDays: 1,
        where: (cutoff) => ({ status: 'COMPLETED', updatedAt: { lt: cutoff } }),
        count: (where) => prisma.aiCallReservation.count({ where }),
        deleteBatch: (where, take) =>
          deleteByIds(
            () => prisma.aiCallReservation.findMany({ where, select: { id: true }, take }),
            (ids) => prisma.aiCallReservation.deleteMany({ where: { id: { in: ids } } }),
          ),
      },
      {
        // OtpCode는 createdAt 대신 expiresAt으로 자른다 — 인덱스가 있고,
        // 만료는 생성 후 수 분이라 기간 의미가 사실상 같다.
        name: 'otpCode',
        envKey: 'RETENTION_OTP_DAYS',
        defaultDays: 30,
        where: (cutoff) => ({ expiresAt: { lt: cutoff } }),
        count: (where) => prisma.otpCode.count({ where }),
        deleteBatch: (where, take) =>
          deleteByIds(
            () => prisma.otpCode.findMany({ where, select: { id: true }, take }),
            (ids) => prisma.otpCode.deleteMany({ where: { id: { in: ids } } }),
          ),
      },
      {
        // 일일 한도 집계는 당일 로그만 보므로 보존 기간은 감사 목적이다.
        name: 'otpSendLog',
        envKey: 'RETENTION_OTP_DAYS',
        defaultDays: 30,
        where: (cutoff) => ({ sentAt: { lt: cutoff } }),
        count: (where) => prisma.otpSendLog.count({ where }),
        deleteBatch: (where, take) =>
          deleteByIds(
            () => prisma.otpSendLog.findMany({ where, select: { id: true }, take }),
            (ids) => prisma.otpSendLog.deleteMany({ where: { id: { in: ids } } }),
          ),
      },
      {
        // 개인 패턴 분석이 보는 기간(기본 400일 — 계절 1주기 + 여유)을 넘긴 스냅샷.
        // Diagnosis.weatherSnapshotId는 SetNull이므로 진단 이력은 남는다.
        name: 'weatherSnapshot',
        envKey: 'RETENTION_WEATHER_SNAPSHOT_DAYS',
        defaultDays: 400,
        where: (cutoff) => ({ collectedAt: { lt: cutoff } }),
        count: (where) => prisma.weatherSnapshot.count({ where }),
        deleteBatch: (where, take) =>
          deleteByIds(
            () => prisma.weatherSnapshot.findMany({ where, select: { id: true }, take }),
            (ids) => prisma.weatherSnapshot.deleteMany({ where: { id: { in: ids } } }),
          ),
      },
    ];
  }
}

/**
 * id를 먼저 뽑고 그 목록만 삭제한다. `deleteMany`에는 LIMIT이 없어 조건에 맞는
 * 전체 행을 한 트랜잭션에서 지우려 하고, 그 사이 테이블 잠금이 길어진다.
 */
async function deleteByIds<T extends { id: string | number }>(
  find: () => Promise<T[]>,
  remove: (ids: Array<T['id']>) => Promise<{ count: number }>,
): Promise<number> {
  const rows = await find();
  if (rows.length === 0) return 0;
  const { count } = await remove(rows.map((r) => r.id) as never);
  return count;
}
