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

    // N11: 운영 필수 외부 의존성 — inference·OTP 게이트웨이(OCTOMO).
    // inference: MOCK_INFERENCE=false인 운영에서 INFERENCE_SERVICE_URL 누락 시
    //   진단 기능이 불가능하므로 ready를 실패시킨다(required).
    // OTP: N9에서 env.registry requiredIn production으로 이미 required_config에 포함.
    this.pushInferenceDependency(dependencies);
    this.pushOctomoDependency(dependencies);

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

  /**
   * N11: inference 의존성. 운영(MOCK_INFERENCE=false)에서
   * INFERENCE_SERVICE_URL이 없으면 required down — 진단이 동작할 수 없기 때문.
   * 개발/테스트(mock)에서는 skipped/optional로 취급한다.
   */
  private pushInferenceDependency(dependencies: HealthDependencyDto[]): void {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const mockInference =
      (this.config.get<string>('MOCK_INFERENCE') ?? '').trim().toLowerCase() ===
      'true';
    const url = (this.config.get<string>('INFERENCE_SERVICE_URL') ?? '').trim();

    if (mockInference || !url) {
      // mock이거나 URL 미설정: 개발/테스트는 mock fallback이 가능하므로 skipped.
      // production에서만 URL 누락을 required down으로 강제한다(진단 불가).
      dependencies.push({
        name: 'inference',
        status: mockInference ? 'skipped' : isProduction ? 'down' : 'skipped',
        required: !mockInference && isProduction,
        detail: mockInference
          ? 'MOCK_INFERENCE=true (dev/test)'
          : isProduction
            ? 'INFERENCE_SERVICE_URL unset in production'
            : 'INFERENCE_SERVICE_URL unset (dev: MOCK_INFERENCE 권장)',
      });
      return;
    }
    dependencies.push({ name: 'inference', status: 'up', required: true });
  }

  /**
   * N11: OTP 게이트웨이(OCTOMO) 의존성. 운영에서 설정이 없으면 ready 실패
   * (env.registry requiredIn production과 정합). 개발/테스트는 MockOtpProvider
   * 사용 가능하므로 skipped로 취급한다.
   */
  private pushOctomoDependency(dependencies: HealthDependencyDto[]): void {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const configured = Boolean(
      (this.config.get<string>('OCTOMO_API_KEY') ?? '').trim(),
    );

    if (configured) {
      dependencies.push({ name: 'octomo', status: 'up', required: isProduction });
      return;
    }
    dependencies.push({
      name: 'octomo',
      status: isProduction ? 'down' : 'skipped',
      required: isProduction,
      detail: isProduction
        ? 'OCTOMO_API_KEY unset in production'
        : 'OCTOMO unset (dev: MockOtpProvider)',
    });
  }
}
