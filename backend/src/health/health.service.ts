import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  HealthDependencyDto,
  HealthLiveResponseDto,
  HealthReadyResponseDto,
  HealthResponseDto,
} from './dto/health-response.dto';
import { getRequiredEnvKeys } from '../config/env.registry';

/**
 * HealthService — live/ready 분리 (N6).
 * - live: 프로세스 event loop 생존
 * - ready: DB·필수 config·migration 상태. Redis/외부 API는 선택적.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  check(): HealthResponseDto {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  live(): HealthLiveResponseDto {
    return {
      status: 'ok',
      probe: 'live',
      timestamp: new Date().toISOString(),
    };
  }

  async ready(): Promise<HealthReadyResponseDto> {
    const dependencies: HealthDependencyDto[] = [];

    // DB
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dependencies.push({ name: 'database', status: 'up', required: true });
    } catch (e) {
      dependencies.push({
        name: 'database',
        status: 'down',
        required: true,
        detail: (e as Error).message,
      });
    }

    // migration 상태 — _prisma_migrations 테이블 존재 여부로 확인
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
        'SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
      );
      const count = Number(rows?.[0]?.count ?? 0);
      dependencies.push({
        name: 'migrations',
        status: count > 0 ? 'up' : 'down',
        required: true,
        detail: `applied=${count}`,
      });
    } catch (e) {
      dependencies.push({
        name: 'migrations',
        status: 'down',
        required: true,
        detail: (e as Error).message,
      });
    }

    // 필수 config
    const missing = getRequiredEnvKeys(this.config.get<string>('NODE_ENV') ?? 'development')
      .filter((key) => {
        const v = this.config.get<string>(key);
        return v === undefined || v === null || String(v).trim() === '';
      });
    dependencies.push({
      name: 'required_config',
      status: missing.length === 0 ? 'up' : 'down',
      required: true,
      detail: missing.length ? `missing=${missing.join(',')}` : undefined,
    });

    // Redis — 선택적. 다운이어도 ready를 무조건 실패시키지 않음.
    try {
      const url = (this.config.get<string>('REDIS_URL') ?? '').trim();
      if (!url) {
        dependencies.push({ name: 'redis', status: 'skipped', required: false, detail: 'REDIS_URL unset' });
      } else if (this.redis.isAvailable()) {
        dependencies.push({
          name: 'redis',
          status: 'up',
          required: false,
        });
      } else {
        dependencies.push({
          name: 'redis',
          status: 'down',
          required: false,
          detail: 'configured but unavailable',
        });
      }
    } catch (e) {
      this.logger.warn(`redis ready check failed: ${(e as Error).message}`);
      dependencies.push({
        name: 'redis',
        status: 'down',
        required: false,
        detail: (e as Error).message,
      });
    }

    const requiredDown = dependencies.some((d) => d.required && d.status === 'down');
    const optionalDown = dependencies.some((d) => !d.required && d.status === 'down');

    return {
      status: requiredDown ? 'error' : optionalDown ? 'degraded' : 'ok',
      probe: 'ready',
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }
}
