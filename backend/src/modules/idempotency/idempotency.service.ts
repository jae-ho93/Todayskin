import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'node:crypto';

/**
 * acquire 결과.
 * - acquired: 호출자가 예약을 보유 — 외부 AI 호출 후 complete()/release()로 마무리.
 * - in_flight: 다른 요청이 PENDING(미만료) — 409로 응답.
 * - completed: 이전 요청이 완료 — 기존 결과를 재반환(추천) 또는 재시도 대상(진단).
 */
export type AcquireOutcome =
  | { outcome: 'acquired' }
  | { outcome: 'in_flight' }
  | { outcome: 'completed' };

/**
 * IdempotencyService (N14) — 외부 AI 호출(추론/Gemini)의 동시 중복 방지.
 *
 * unique(scopeKey)를 가진 ai_call_reservations row를 외부 호출 **전에** PENDING으로
 * 예약한다. 동일 scopeKey의 동시 요청은 하나만 acquired가 되고 나머지는 in_flight(409)
 * 또는 completed(동일 결과 재반환)를 받는다.
 *
 * 상태 전이:
 * - PENDING → COMPLETED: 추천 생성 성공 시 complete()로 전환 (동일 결과 재반환용 보존)
 * - PENDING → 삭제: 진단 흐름의 release() — 순수 in-flight 가드
 * - PENDING(expiresAt 경과) 또는 FAILED → PENDING: 다음 요청이 takeover해 재시도
 *   (크래시/타임아웃으로 stuck된 예약을 lease TTL로 회수)
 */
@Injectable()
export class IdempotencyService {
  /**
   * PENDING 예약 lease. 외부 호출(추론+저장) 최대 시간보다 넉넉히 잡는다.
   * 프론트 진단 타임아웃(45s)·Gemini 클라이언트 타임아웃(30s)보다 길게 유지해
   * 정상 요청이 lease 만료로 takeover당하지 않게 한다.
   */
  static readonly LEASE_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 외부 AI 호출 전 예약을 시도한다.
   * DB 경쟁에서 안전하게 unique(scopeKey) ON CONFLICT DO NOTHING + 재조회로 판단한다.
   */
  async acquire(scopeKey: string, userId: number): Promise<AcquireOutcome> {
    // 1. 삽입 시도 — 이미 있으면 0행.
    const inserted = await this.tryInsert(scopeKey, userId);
    if (inserted) return { outcome: 'acquired' };

    // 2. 기존 row 기준 판단 (삽입↔삭제 경쟁은 최대 2회 재시도).
    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = await this.prisma.aiCallReservation.findUnique({
        where: { scopeKey },
      });
      if (!existing) {
        // 방금 다른 요청이 release(삭제)했다 → 다시 삽입.
        if (await this.tryInsert(scopeKey, userId)) {
          return { outcome: 'acquired' };
        }
        continue;
      }

      if (existing.status === 'PENDING' && existing.expiresAt.getTime() > Date.now()) {
        return { outcome: 'in_flight' };
      }
      if (existing.status === 'COMPLETED') {
        return { outcome: 'completed' };
      }

      // FAILED 또는 만료된 PENDING → takeover해 내 것으로 만든다.
      const taken = await this.prisma.aiCallReservation.updateMany({
        where: {
          id: existing.id,
          OR: [
            { status: 'FAILED' },
            { status: 'PENDING', expiresAt: { lt: new Date() } },
          ],
        },
        data: {
          status: 'PENDING',
          expiresAt: new Date(Date.now() + IdempotencyService.LEASE_TTL_MS),
          updatedAt: new Date(),
        },
      });
      if (taken.count === 1) return { outcome: 'acquired' };
      // 다른 요청이 먼저 takeover/완료했다 → 다음 루프에서 재판단.
    }

    return { outcome: 'in_flight' };
  }

  /** 성공 완료 — PENDING → COMPLETED (추천의 동일 결과 재반환용). */
  async complete(scopeKey: string): Promise<void> {
    await this.prisma.aiCallReservation.updateMany({
      where: { scopeKey, status: 'PENDING' },
      data: { status: 'COMPLETED', updatedAt: new Date() },
    });
  }

  /** 예약 해제(삭제) — 진단 완료/실패, 또는 추천 실패 시 재시도 허용. COMPLETED는 보존. */
  async release(scopeKey: string): Promise<void> {
    await this.prisma.aiCallReservation.deleteMany({
      where: { scopeKey, status: 'PENDING' },
    });
  }

  /**
   * COMPLETED 예약을 PENDING으로 되돌려 재시도하게 한다 (결과가 정리된 경우).
   * @returns true면 이 요청이 재점유 — 계속 진행. false면 다른 요청이 이미
   *          retake/완료해 in-flight 상태 — 409로 응답해 이중 호출을 막는다.
   */
  async retake(scopeKey: string): Promise<boolean> {
    const updated = await this.prisma.aiCallReservation.updateMany({
      where: { scopeKey, status: 'COMPLETED' },
      data: {
        status: 'PENDING',
        expiresAt: new Date(Date.now() + IdempotencyService.LEASE_TTL_MS),
        updatedAt: new Date(),
      },
    });
    return updated.count === 1;
  }

  private async tryInsert(scopeKey: string, userId: number): Promise<boolean> {
    const now = new Date();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "ai_call_reservations"
        ("id", "user_id", "scope_key", "status", "expires_at", "created_at", "updated_at")
      VALUES
        (${randomUUID()}, ${userId}, ${scopeKey}, 'PENDING'::"AiCallReservationStatus",
         ${new Date(now.getTime() + IdempotencyService.LEASE_TTL_MS)}, ${now}, ${now})
      ON CONFLICT ("scope_key") DO NOTHING
      RETURNING "id"
    `;
    return rows.length > 0;
  }
}
