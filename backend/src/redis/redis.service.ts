import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisService — T12 날씨 캐시용 Redis 연결.
 *
 * 설계 기준:
 * - REDIS_URL이 비어 있거나 연결 실패해도 NestJS 부팅을 막지 않는다.
 *   캐시는 성능 최적화 계층이므로 부재 시 외부 API/DB fallback으로 서비스가 동작해야 한다.
 * - isAvailable()로 호출부가 캐시 사용 가능 여부를 판단한다.
 * - 모든 메서드는 Redis 장애 시 예외를 throw하지 않고 null/false를 반환한다(장애 전파 방지).
 * - API 키 등 시크릿은 로그에 절대 노출하지 않는다.
 *
 * TTL과 무효화 정책:
 * - 날씨 데이터는 분 단위로 갱신되므로 기본 TTL 300초(5분)를 사용한다.
 *   WEATHER_CACHE_TTL_SECONDS 환경변수로 조정 가능하다.
 * - 무효화는 명시적 invalidate(key)로 수행하며, 외부 API 갱신 주기와 맞춘다.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private available = false;

  private readonly weatherTtlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.weatherTtlSeconds = this.configService.get<number>(
      'WEATHER_CACHE_TTL_SECONDS',
      300,
    );
  }

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('REDIS_URL', '');
    if (!url) {
      this.logger.warn('REDIS_URL이 없습니다 — 날씨 캐시 비활성화, 외부 API 직접 호출');
      return;
    }

    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        enableReadyCheck: true,
        lazyConnect: false,
        connectTimeout: 2_000,
        commandTimeout: 2_000,
        retryStrategy: (times) => Math.min(times * 500, 5_000),
      });

      this.client.on('error', (err: Error) => {
        this.available = false;
        this.logger.warn(`Redis error: ${err.name} — 캐시 fallback 모드`);
      });

      this.client.on('connect', () => {
        this.logger.log('Redis connected');
      });

      this.client.on('ready', () => {
        this.available = true;
        this.logger.log('Redis ready');
      });

      this.client.on('close', () => {
        this.available = false;
        this.logger.warn('Redis connection closed — 캐시 fallback 모드');
      });

      this.client.on('end', () => {
        this.available = false;
        this.logger.warn('Redis reconnect ended — 캐시 fallback 모드');
      });

      try {
        await this.client.ping();
        this.available = this.client.status === 'ready';
      } catch (e) {
        this.available = false;
        this.logger.warn(
          `Redis ping 실패: ${errorName(e)} — 캐시 fallback 모드로 시작`,
        );
      }
    } catch (e) {
      this.logger.warn(`Redis 연결 실패: ${errorName(e)} — 캐시 비활성화`);
      this.client = null;
      this.available = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    this.available = false;
    this.client = null;
    if (client) {
      if (client.status === 'ready') {
        await client.quit().catch(() => undefined);
      } else {
        client.disconnect();
      }
      this.logger.log('Redis disconnected');
    }
  }

  isAvailable(): boolean {
    return this.available && this.client?.status === 'ready';
  }

  get weatherTtl(): number {
    return this.weatherTtlSeconds;
  }

  /**
   * 캐시에서 JSON 값을 읽어 파싱한다.
   * Redis 장애 또는 키 부재 시 null 반환(예외 전파 안 함).
   */
  async getJson<T>(key: string): Promise<T | null> {
    if (!this.isAvailable() || !this.client) return null;
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (e) {
      this.available = false;
      this.logger.debug(`Redis get 실패: ${errorName(e)} — 캐시 miss 처리`);
      return null;
    }
  }

  /**
   * JSON 값을 TTL과 함께 저장한다.
   * Redis 장애 시 조용히 실패한다(캐시 부재로 다음 요청이 외부 API를 친다).
   */
  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    if (!this.isAvailable() || !this.client) return false;
    try {
      const raw = JSON.stringify(value);
      const ttl = ttlSeconds ?? this.weatherTtlSeconds;
      await this.client.set(key, raw, 'EX', ttl);
      return true;
    } catch (e) {
      this.available = false;
      this.logger.debug(`Redis set 실패: ${errorName(e)} — 캐시 저장 생략`);
      return false;
    }
  }

  /** 특정 키 무효화. 갱신 주기 강제 갱신이나 수동 flush에 사용. */
  async invalidate(key: string): Promise<boolean> {
    if (!this.isAvailable() || !this.client) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (e) {
      this.available = false;
      this.logger.debug(`Redis del 실패: ${errorName(e)}`);
      return false;
    }
  }

  /** 테스트/운영용 — 패턴 기반 일괄 무효화. SCAN 사용(KEYS는 운영 차단 위험). */
  async invalidatePattern(pattern: string): Promise<number> {
    if (!this.isAvailable() || !this.client) return 0;
    try {
      let count = 0;
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = next;
        if (keys.length > 0) {
          await this.client.del(...keys);
          count += keys.length;
        }
      } while (cursor !== '0');
      return count;
    } catch (e) {
      this.available = false;
      this.logger.debug(`Redis invalidatePattern 실패: ${errorName(e)}`);
      return 0;
    }
  }
}

function errorName(e: unknown): string {
  return e instanceof Error ? e.name : String(e);
}
