import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { JobStateService } from './job-state.service';
import { JobStatus } from './enums/job-status.enum';
import { JobType } from './enums/job-type.enum';

/**
 * R8: fast-path SWR 알고리즘.
 *
 * 추천(`recommendation.service`)과 날씨 제품(`product.service`)이 같은 절차를 통째로
 * 복제하고 있었다 — job dedup → Redis SWR → 규칙 fallback + enqueue. 캐시 정책이나
 * dedupe 규칙을 바꾸려면 두 곳을 함께 고쳐야 했고, 한쪽만 고치면 두 화면이 서로 다른
 * 신선도 정책으로 동작한다. 세 번째 fast-path가 생기면 세 벌이 된다.
 *
 * 도메인은 "무엇을 보여줄지"(fallback·job 결과 해석·enqueue)만 넘기고,
 * "언제 무엇을 쓸지"(신선도·중복 억제·실패 억제)는 여기서 한 번만 정한다.
 */

/** Redis SWR 캐시 TTL(초). */
export const FAST_PATH_CACHE_TTL_S = 6 * 60 * 60;

/** CACHED 항목이 이 시간보다 오래되면 재검증(LIVE) job을 enqueue한다. */
export const FAST_PATH_REVALIDATE_MS = 30 * 60 * 1000;

/** 중복 enqueue 방지 job 조회 창 — 이 시간 안의 job을 재사용 후보로 본다. */
export const FAST_PATH_JOB_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

/** FAILED job이 이 시간 안이면 재사용(FALLBACK + 같은 jobId)하고, 지나면 새 job을 만든다. */
export const FAST_PATH_FAILED_COOLDOWN_MS = 5 * 60 * 1000;

export type FastPathSource = 'LIVE' | 'CACHED' | 'FALLBACK';

export interface FastPathResult<T> {
  source: FastPathSource;
  /** FE가 GET /jobs/:id로 LIVE 교체를 기다릴 수 있게 항상 함께 내린다(가능한 경우). */
  jobId?: string;
  generatedAt?: string;
  items: T[];
}

export interface FastPathRequest<T> {
  userId: number;
  jobType: JobType;
  /**
   * 같은 대상에 대한 중복 enqueue를 막는 키(R10). 없으면 job 재사용 단계를 건너뛴다
   * — 추천의 호환 모드(diagnosisId 없이 skinScore+weather를 직접 받는 경로)가 그렇다.
   */
  dedupeKey?: string;
  /** Redis SWR 키. */
  cacheKey: string;
  /** COMPLETED job의 result에서 항목을 꺼낸다. 비어 있으면 LIVE로 보지 않는다. */
  readJobResult: (result: unknown) => T[];
  /** 캐시 미스에서 즉시 보여줄 규칙 기반 결과. */
  loadFallback: () => Promise<T[]> | T[];
  /** LIVE 교체 job 등록. 실패해도 FALLBACK은 반환해야 하므로 undefined를 허용한다. */
  enqueue: () => Promise<string | undefined>;
  /** COMPLETED job에서 얻은 LIVE 결과를 캐시에도 적재할지(추천 경로). */
  cacheLiveResult?: boolean;
}

interface CacheEnvelope<T> {
  items: T[];
  generatedAt: string;
}

@Injectable()
export class FastPathCoordinator {
  private readonly logger = new Logger(FastPathCoordinator.name);

  constructor(
    private readonly redis: RedisService,
    private readonly jobState: JobStateService,
  ) {}

  /**
   * 첫 응답을 즉시 만든다. 우선순위:
   * 1. 진행 중/완료/최근 실패 job 재사용 (COMPLETED → LIVE, 그 외 → FALLBACK + 같은 jobId)
   * 2. Redis SWR hit → CACHED (오래됐으면 재검증 job을 붙인다)
   * 3. miss → FALLBACK + LIVE job enqueue
   */
  async resolve<T>(req: FastPathRequest<T>): Promise<FastPathResult<T>> {
    const reused = await this.reuseJob(req);
    if (reused) return reused;

    const cached = await this.readCache<T>(req.cacheKey);
    if (cached) {
      const stale =
        Date.now() - new Date(cached.generatedAt).getTime() > FAST_PATH_REVALIDATE_MS;
      return {
        source: 'CACHED',
        // SWR: 낡은 데이터를 먼저 보여주고 뒤에서 LIVE로 재검증한다.
        jobId: stale ? await req.enqueue() : undefined,
        generatedAt: cached.generatedAt,
        items: cached.items,
      };
    }

    const items = await req.loadFallback();
    return { source: 'FALLBACK', jobId: await req.enqueue(), items };
  }

  /** LIVE 결과를 SWR 캐시에 적재한다. Redis 장애 시 조용히 실패한다(캐시는 최적화 계층). */
  async writeCache<T>(cacheKey: string, items: T[]): Promise<void> {
    await this.redis.setJson(
      cacheKey,
      { items, generatedAt: new Date().toISOString() } satisfies CacheEnvelope<T>,
      FAST_PATH_CACHE_TTL_S,
    );
  }

  private async reuseJob<T>(req: FastPathRequest<T>): Promise<FastPathResult<T> | null> {
    if (!req.dedupeKey) return null;

    const job = await this.jobState.findRecentByDedupeKey({
      userId: req.userId,
      type: req.jobType,
      dedupeKey: req.dedupeKey,
      withinMs: FAST_PATH_JOB_DEDUPE_WINDOW_MS,
    });
    if (!job) return null;

    if (job.status === JobStatus.COMPLETED) {
      const items = req.readJobResult(job.result);
      // 결과가 비어 있으면 LIVE로 볼 수 없다 — 아래 단계로 내려가 fallback을 보여준다.
      if (items.length === 0) return null;
      if (req.cacheLiveResult) await this.writeCache(req.cacheKey, items);
      return {
        source: 'LIVE',
        jobId: job.id,
        generatedAt: job.finishedAt?.toISOString(),
        items,
      };
    }

    // PENDING은 물론, cooldown 안의 FAILED도 같은 jobId를 다시 알려준다.
    // FE가 그 job의 상태를 보고 있고, 실패 직후 새 job을 만들면 Gemini 호출만 늘어난다.
    if (job.status === JobStatus.FAILED && !this.isRecentlyFailed(job)) return null;

    return {
      source: 'FALLBACK',
      jobId: job.id,
      items: await req.loadFallback(),
    };
  }

  private isRecentlyFailed(job: { finishedAt: Date | null }): boolean {
    return (
      !!job.finishedAt &&
      Date.now() - job.finishedAt.getTime() < FAST_PATH_FAILED_COOLDOWN_MS
    );
  }

  private async readCache<T>(cacheKey: string): Promise<CacheEnvelope<T> | null> {
    const cached = await this.redis.getJson<CacheEnvelope<T>>(cacheKey);
    if (!cached || !Array.isArray(cached.items) || !cached.generatedAt) {
      if (cached) {
        this.logger.debug(`fast-path 캐시 형식 불일치 — miss 처리 (key=${cacheKey})`);
      }
      return null;
    }
    return cached;
  }
}
