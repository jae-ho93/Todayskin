import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../../redis/redis.service';

/**
 * R3: 스케줄러 리더 선출.
 *
 * ECS 서비스의 모든 task는 같은 task definition을 공유하므로 "정확히 한 task만
 * 켜 둔다"는 환경변수로는 표현할 수 없다. desiredCount를 2 이상으로 올리는 순간
 * 모든 task가 같은 스케줄러를 돌려 정부 API를 중복 호출하고, soft-delete 물리
 * 삭제처럼 되돌릴 수 없는 작업이 동시에 실행된다.
 *
 * 각 tick 진입 시 Redis에 `SET NX PX`로 락을 잡고, 잡은 인스턴스만 실행한다.
 * 락은 해제하지 않고 TTL(기본 인터벌의 1.5배)로 만료시킨다 — 작업이 끝날 때
 * 해제하면 같은 주기에 다른 인스턴스가 이어서 실행하기 때문이다.
 *
 * 트레이드오프: 락 보유 인스턴스가 작업 중 죽으면 최대 TTL만큼(= 한 주기 정도)
 * 실행이 건너뛰어진다. 스케줄러 작업은 모두 다음 tick에서 복구되는 성격
 * (만료분 정리·시계열 수집·삭제 재시도)이라 이 손실을 허용한다.
 *
 * Redis가 없는 환경(로컬·단일 인스턴스)에서는 락 없이 실행한다 — 현재 동작 유지.
 */
@Injectable()
export class SchedulerLeaderService {
  private readonly logger = new Logger(SchedulerLeaderService.name);
  /** 락 소유자 식별용. 로그로 어느 인스턴스가 실행 중인지 추적한다. */
  private readonly instanceId = `${process.pid}-${randomUUID().slice(0, 8)}`;

  constructor(private readonly redis: RedisService) {}

  /**
   * 리더인 경우에만 `task`를 실행한다.
   *
   * @param name 스케줄러 이름 — 락 키(`scheduler:{name}:leader`)가 된다.
   * @param ttlMs 락 유지 시간. 인터벌의 1.5배 이상을 권장한다.
   * @returns 실행했으면 true, 다른 인스턴스가 리더라 건너뛰었으면 false.
   */
  async runIfLeader(name: string, ttlMs: number, task: () => Promise<void>): Promise<boolean> {
    if (!(await this.tryAcquire(name, ttlMs))) return false;
    await task();
    return true;
  }

  private async tryAcquire(name: string, ttlMs: number): Promise<boolean> {
    // Redis가 없으면 분산 조율이 불가능하다. 이 경우 스케줄러를 멈추면 로컬
    // 개발과 Redis 미구성 배포에서 정리 작업이 아예 돌지 않으므로 실행한다.
    if (!this.redis.isAvailable()) return true;

    const acquired = await this.redis.acquireLock(
      `scheduler:${name}:leader`,
      ttlMs,
      this.instanceId,
    );
    if (!acquired) {
      this.logger.debug(`${name}: 다른 인스턴스가 리더 — 이번 tick 건너뜀`);
      return false;
    }
    this.logger.log(`${name}: 리더 획득 (instance=${this.instanceId}, ttlMs=${ttlMs})`);
    return true;
  }
}

/** 인터벌 대비 권장 락 TTL. 작업이 인터벌을 넘겨도 중복 실행되지 않게 여유를 둔다. */
export function leaderLockTtlMs(intervalMs: number): number {
  return Math.ceil(intervalMs * 1.5);
}
