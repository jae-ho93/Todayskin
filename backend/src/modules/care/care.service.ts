import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  GeneratedCarePlan,
  GeneratedCareProduct,
  GeneratedCareRoutineStep,
  OpenAiClient,
  WeatherInput,
} from '../openai/openai.client';
import { WeatherService } from '../weather/weather.service';
import { JobService } from '../jobs/job.service';
import { JobStateService } from '../jobs/job-state.service';
import { jobDedupeKeyOf } from '../jobs/job-dedupe';
import { JobType } from '../jobs/enums/job-type.enum';
import {
  FastPathCoordinator,
  FAST_PATH_JOB_DEDUPE_WINDOW_MS,
} from '../jobs/fast-path.coordinator';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { toWeatherSnapshotDto } from '../weather/mappers/weather-snapshot.mapper';
import { todayKst } from '../diagnosis/calendar-date.util';
import { notDeletedWhere } from '../../common/soft-delete/soft-delete.policy';
import { diagnosisToSkinInput } from './mappers/skin-analysis.mapper';
import { fallbackCarePlan } from './content/fallback-content';
import { isLinkDead } from './care-link-validator';
import { CarePlanDto, CarePlanFastResponseDto, CareType } from './dto/care-plan.dto';

/** Redis exclude 세션 TTL — 하루 지나면 "최근 추천"의 의미가 옅어진다. */
const EXCLUDE_TTL_S = 24 * 60 * 60;
/** exclude 목록이 무한정 자라지 않게 최근 N개만 보존한다. */
const EXCLUDE_LIST_MAX = 20;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

interface CareJobPayload {
  careKey: string;
  careType: CareType;
  diagnosisId?: string;
  lat?: number;
  lon?: number;
}

/**
 * CareService — 케어 루틴+제품 빠른 경로(N32/N29 rec-fast-path와 동일 패턴).
 *
 * FastPathCoordinator를 그대로 재사용한다 — 케어 플랜은 배열이 아니라 단일 객체지만,
 * FastPathRequest<T>가 `items: T[]`를 기대하므로 항상 0개 또는 1개짜리 배열로
 * 감싸 넘긴다("아직 준비 안 됨" = 빈 배열이라는 기존 관례와 일치한다).
 */
@Injectable()
export class CareService {
  private readonly logger = new Logger(CareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly openAiClient: OpenAiClient,
    private readonly weatherService: WeatherService,
    private readonly jobService: JobService,
    private readonly jobState: JobStateService,
    private readonly idempotency: IdempotencyService,
    private readonly fastPath: FastPathCoordinator,
  ) {}

  // ── 빠른 경로 진입점 (컨트롤러가 호출) ──────────────────────

  async getWeatherFast(
    userId: number,
    opts?: { lat?: number; lon?: number; refresh?: boolean },
  ): Promise<CarePlanFastResponseDto> {
    const weather = await this.weatherService.resolveServerWeather(opts?.lat, opts?.lon);
    const regionKey = weather.regionName ?? 'base';
    const careKey = `weather:${regionKey}:${todayKst()}`;
    return this.resolveFast(userId, 'weather', careKey, opts?.refresh, () =>
      this.enqueueCareJob(userId, 'weather', careKey, { lat: opts?.lat, lon: opts?.lon }),
    );
  }

  async getSkinFast(
    userId: number,
    diagnosisId: string,
    refresh?: boolean,
  ): Promise<CarePlanFastResponseDto> {
    await this.assertDiagnosisOwnership(diagnosisId, userId);
    const careKey = `skin:${diagnosisId}`;
    return this.resolveFast(userId, 'skin', careKey, refresh, () =>
      this.enqueueCareJob(userId, 'skin', careKey, { diagnosisId }),
    );
  }

  async getCombinedFast(
    userId: number,
    diagnosisId: string,
    refresh?: boolean,
  ): Promise<CarePlanFastResponseDto> {
    await this.assertDiagnosisOwnership(diagnosisId, userId);
    const careKey = `combined:${diagnosisId}`;
    return this.resolveFast(userId, 'combined', careKey, refresh, () =>
      this.enqueueCareJob(userId, 'combined', careKey, { diagnosisId }),
    );
  }

  private async assertDiagnosisOwnership(diagnosisId: string, userId: number): Promise<void> {
    const diagnosis = await this.prisma.diagnosis.findFirst({
      where: notDeletedWhere({ id: diagnosisId, userId }),
      select: { id: true },
    });
    if (!diagnosis) {
      throw new NotFoundException('진단을 찾을 수 없어요');
    }
  }

  // ── job handler가 호출하는 실제 생성 경로 ──────────────────────

  /**
   * OpenAI 호출 + 후처리(exclude 필터·링크 검증) + exclude 세션 갱신.
   * exclude 필터링 후 제품이 하나도 안 남으면(LLM이 지시를 무시하고 제외 목록과
   * 겹치는 제품만 골랐거나, 링크가 전부 죽었으면) 같은 exclude로 1회만 재호출한다.
   */
  async generateLive(userId: number, careType: CareType, payload: CareJobPayload): Promise<CarePlanDto> {
    const skin = careType !== 'weather' ? await this.loadSkinInput(payload.diagnosisId!, userId) : null;
    const weather =
      careType !== 'skin' ? await this.loadWeatherInput(careType, payload) : null;

    const excludeKey = this.excludeKey(userId, careType);
    const excludeProducts = (await this.redis.getJson<string[]>(excludeKey)) ?? [];

    let generated = await this.openAiClient.generateCarePlan(careType, skin, weather, excludeProducts);
    let plan = await this.postProcess(generated, careType, excludeProducts);

    if (plan.products.length === 0 && generated.products.length > 0) {
      this.logger.warn(
        `케어 플랜 후처리 후 제품 0개 — 같은 exclude로 1회 재요청 (careType=${careType})`,
      );
      const retryExclude = Array.from(
        new Set([...excludeProducts, ...generated.products.map((p) => p.name)]),
      );
      generated = await this.openAiClient.generateCarePlan(careType, skin, weather, retryExclude);
      plan = await this.postProcess(generated, careType, retryExclude);
    }

    await this.appendExcludeList(excludeKey, plan.products.map((p) => p.name));
    return plan;
  }

  private async loadSkinInput(
    diagnosisId: string,
    userId: number,
  ): Promise<Record<string, unknown>> {
    const diagnosis = await this.prisma.diagnosis.findFirst({
      where: notDeletedWhere({ id: diagnosisId, userId }),
      include: { skinMetrics: true },
    });
    if (!diagnosis) {
      throw new NotFoundException('진단을 찾을 수 없어요');
    }
    return diagnosisToSkinInput(diagnosis, diagnosis.skinMetrics);
  }

  /**
   * weather: 좌표 기반 오늘 날씨(서버 소유 계약, N12).
   * combined: 그 진단에 실제로 연결된 WeatherSnapshot(diagnosis.weatherSnapshotId) —
   * "이 진단 당시의 날씨"라는 뜻이라 좌표를 받지 않는다(요청 바디에도 lat/lon이 없다).
   * 연결된 스냅샷이 없으면(외출 안 함) null — combined도 사실상 skin과 동일하게 처리된다.
   */
  private async loadWeatherInput(
    careType: CareType,
    payload: CareJobPayload,
  ): Promise<WeatherInput | null> {
    if (careType === 'weather') {
      const dto = await this.weatherService.resolveServerWeather(payload.lat, payload.lon);
      return { ...dto };
    }
    // combined
    const diagnosis = await this.prisma.diagnosis.findUnique({
      where: { id: payload.diagnosisId! },
      select: { weatherSnapshotId: true },
    });
    if (!diagnosis?.weatherSnapshotId) return null;
    const snapshot = await this.weatherService.getSnapshotById(diagnosis.weatherSnapshotId);
    if (!snapshot) return null;
    // 원본 Prisma row는 observedAt이 Date다 — WeatherInput은 문자열을 기대하므로
    // DTO 매퍼를 거친다(product.service.ts의 snapshotToDto와 동일 이유).
    return { ...toWeatherSnapshotDto(snapshot) };
  }

  /**
   * 1. exclude 필터: LLM이 "다른 제품 고르라"는 지시를 무시했을 경우의 서버측 방어.
   * 2. 링크 검증: 제품은 dead면 통째로 제거, evidence는 dead면 evidence만 비운다
   *    (근거 없이도 루틴/제품 자체는 유효할 수 있다).
   */
  private async postProcess(
    generated: GeneratedCarePlan,
    careType: CareType,
    excludeProducts: string[],
  ): Promise<CarePlanDto> {
    const excludeSet = new Set(excludeProducts.map(normalizeProductName));
    const afterExclude = generated.products.filter(
      (p) => !excludeSet.has(normalizeProductName(p.name)),
    );

    const [products, routine] = await Promise.all([
      this.validateProducts(afterExclude),
      this.validateRoutineEvidence(generated.routine),
    ]);

    return {
      careType,
      routine,
      products,
      medicalDisclaimer: generated.medicalDisclaimer,
    };
  }

  private async validateProducts(
    products: GeneratedCareProduct[],
  ): Promise<GeneratedCareProduct[]> {
    const checked = await Promise.all(
      products.map(async (p) => {
        if (await isLinkDead(p.url)) return null;
        const evidence =
          p.evidence && !(await isLinkDead(p.evidence.sourceUrl as string)) ? p.evidence : null;
        return { ...p, evidence };
      }),
    );
    return checked.filter((p): p is GeneratedCareProduct => p !== null);
  }

  private async validateRoutineEvidence(
    routine: GeneratedCareRoutineStep[],
  ): Promise<GeneratedCareRoutineStep[]> {
    return Promise.all(
      routine.map(async (step) => {
        const evidence =
          step.evidence && !(await isLinkDead(step.evidence.sourceUrl as string))
            ? step.evidence
            : null;
        return { ...step, evidence };
      }),
    );
  }

  // ── Redis exclude 세션 ──────────────────────────

  private excludeKey(userId: number, careType: CareType): string {
    return `care:exclude:${userId}:${careType}`;
  }

  private async appendExcludeList(key: string, names: string[]): Promise<void> {
    if (names.length === 0) return;
    const existing = (await this.redis.getJson<string[]>(key)) ?? [];
    const merged = Array.from(new Set([...existing, ...names])).slice(-EXCLUDE_LIST_MAX);
    await this.redis.setJson(key, merged, EXCLUDE_TTL_S);
  }

  // ── N32 빠른 경로 헬퍼 (product.service.ts와 동일 패턴) ──────────────────────

  private cacheKey(careType: CareType, careKey: string): string {
    return `care:plan:${careType}:${careKey}`;
  }

  private async resolveFast(
    userId: number,
    careType: CareType,
    careKey: string,
    refresh: boolean | undefined,
    enqueue: () => Promise<string | undefined>,
  ): Promise<CarePlanFastResponseDto> {
    const cacheKey = this.cacheKey(careType, careKey);
    if (refresh) {
      // refresh 의도: 직전 결과를 재사용하지 않는다 — 캐시를 지우고 job 재사용(dedupeKey)도
      // 건너뛰어 fastPath.resolve가 곧장 FALLBACK + 새 LIVE job으로 가게 한다.
      await this.redis.invalidate(cacheKey);
    }

    const result = await this.fastPath.resolve<CarePlanDto>({
      userId,
      jobType: JobType.CARE_GENERATE,
      dedupeKey: refresh ? undefined : jobDedupeKeyOf('careKey', careKey),
      cacheKey,
      readJobResult: (jobResult) => {
        const plan = (jobResult as { plan?: CarePlanDto } | null)?.plan;
        return plan ? [plan] : [];
      },
      loadFallback: () => [fallbackCarePlan(careType)],
      enqueue,
    });

    return {
      source: result.source,
      jobId: result.jobId,
      generatedAt: result.generatedAt,
      plan: result.items[0] ?? fallbackCarePlan(careType),
    };
  }

  /**
   * LIVE 교체 job을 enqueue한다. N14 reservation으로 동시 요청의 중복 enqueue를
   * 막는다 — in-flight면 방금 생성된 job row를 찾아 재사용(OpenAI 중복 호출 방지).
   * 실패해도 FALLBACK은 반환한다.
   */
  private async enqueueCareJob(
    userId: number,
    careType: CareType,
    careKey: string,
    extra: { diagnosisId?: string; lat?: number; lon?: number },
  ): Promise<string | undefined> {
    const scope = `care:${userId}:${careType}:${careKey}`;
    const reservation = await this.idempotency.acquire(scope, userId);

    if (reservation.outcome === 'in_flight') {
      const pending = await this.findCareJob(userId, careKey);
      if (pending) return pending.id;
      await sleepMs(200);
      const retry = await this.findCareJob(userId, careKey);
      return retry?.id;
    }

    const ownsReservation = reservation.outcome === 'acquired';
    try {
      const { jobId } = await this.jobService.enqueue(userId, JobType.CARE_GENERATE, {
        careKey,
        careType,
        ...extra,
      });
      if (ownsReservation) {
        await this.idempotency.complete(scope);
      }
      return jobId;
    } catch (e) {
      if (ownsReservation) {
        await this.idempotency.release(scope);
      }
      this.logger.warn(
        `Care fast path: LIVE job enqueue failed (userId=${userId}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return undefined;
    }
  }

  private async findCareJob(userId: number, careKey: string) {
    return this.jobState.findRecentByDedupeKey({
      userId,
      type: JobType.CARE_GENERATE,
      dedupeKey: jobDedupeKeyOf('careKey', careKey),
      withinMs: FAST_PATH_JOB_DEDUPE_WINDOW_MS,
    });
  }
}

export type { CareJobPayload };
