import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../../redis/redis.service';
import { SENSITIVE_THROTTLER } from './sensitive-throttle';

/** @nestjs/throttler v6가 요구하는 저장소 반환 형식. */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * N11: Redis 기반 분산 Rate Limit 저장소.
 *
 * ECS 다중 task에서도 분당 제한이 인스턴스별로 나뉘지 않고 일관되게 동작하도록
 * ThrottlerStorage를 Redis 카운터로 구현한다. 키 접두사는 `throttle:`.
 *
 * 장애 정책(fail-open, 단 sensitive는 fail-closed):
 * - Redis가 다운되면 increment가 null을 반환 → totalHits=0, isBlocked=false로
 *   처리해 요청을 통과시킨다. rate limit이 서비스 가용성을 깨지 않게 한다.
 *   (Redis 복구 전 짧은 기간 남용 가능성은 인지된 tradeoff — N11 문서화 대상)
 * - N47 예외: 인증·OTP 라우트(SENSITIVE_THROTTLER)는 브루트포스 표적이라
 *   한도를 확인할 수 없으면 요청을 503으로 거부한다 (fail-closed).
 * - isBlocked 판단은 v6 기본 스토리지와 동일하게 `totalHits > limit`.
 *   단, 메모리 스토리지는 blockDuration=0이면 다음 요청에 즉시 언블록되지만,
 *   Redis 구현은 윈도우 TTL이 끝날 때까지 유지한다(더 엄격한 분당 제한 — 목적에 부합).
 * - fail-open 경고는 상태 전이 시 1회만 남기고(장애 중 요청마다 스팸 금지),
 *   key(IP 포함)는 해시 앞자리만 노출한다.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private storageUnavailableLogged = false;

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));

    const hits = await this.redis.incrementCounter(redisKey, ttlSeconds);
    if (hits === null) {
      this.warnOnceOnUnavailable(throttlerName);
      if (throttlerName === SENSITIVE_THROTTLER) {
        // N47: 인증·OTP는 한도 확인이 불가능하면 통과시키지 않는다 (fail-closed).
        throw new ServiceUnavailableException(
          '요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
      // Redis 장애 — fail-open. 요청을 차단하지 않는다.
      return {
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
    this.storageUnavailableLogged = false;

    const ttlLeft = await this.redis.getCounterTtlMs(redisKey);
    return {
      totalHits: hits,
      timeToExpire: ttlLeft > 0 ? ttlLeft : ttl,
      isBlocked: hits > limit,
      timeToBlockExpire: hits > limit ? ttlLeft : 0,
    };
  }

  /** Redis 복구 전까지 경고를 1회만 남긴다. key는 해시로만 노출. */
  private warnOnceOnUnavailable(throttlerName: string): void {
    if (this.storageUnavailableLogged) return;
    this.storageUnavailableLogged = true;
    this.logger.warn(
      `Rate limit storage(Redis) unavailable — fail-open 활성 (${throttlerName})`,
    );
  }
}

