import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CARE_FIXED_PHASES,
  GeneratedCarePlan,
  GeneratedCareProduct,
  GeneratedCareRoutineStep,
  OpenAiClient,
  UserProfileInput,
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
import { Product } from '@prisma/client';
import { ProductCatalogService } from '../products/product-catalog.service';
import { fallbackCarePlan } from './content/fallback-content';
import { isLinkDead } from './care-link-validator';
import {
  CarePlanDto,
  CarePlanFastResponseDto,
  CareProductCategory,
  CareProductDto,
  CareType,
} from './dto/care-plan.dto';

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

/**
 * FALLBACK용 카테고리 매핑 — 시드 카탈로그의 category(moisture/elasticity/... 효능 기준)는
 * 케어 화면의 사용 단계(클렌저→선크림)와 1:1이 아니어서, 제품명 키워드로 추론한다.
 * 배열 순서가 우선순위다(예: "선크림"이 "크림"보다 먼저 매칭되어야 한다).
 */
const CARE_CATEGORY_RULES: ReadonlyArray<{ category: CareProductCategory; keywords: string[] }> = [
  { category: '선크림', keywords: ['선크림', '썬크림', '선플러스', '선젤'] },
  { category: '클렌저', keywords: ['클렌저', '클렌징', '휩', '폼', '워시'] },
  { category: '토너', keywords: ['토너', '리파이너'] },
  { category: '마스크팩', keywords: ['마스크', '팩'] },
  { category: '에센스/세럼/앰플', keywords: ['에센스', '세럼', '앰플'] },
  { category: '로션', keywords: ['로션'] },
  { category: '크림', keywords: ['크림', '밤'] },
];

function inferCareCategory(name: string): CareProductCategory {
  const normalized = name.toLowerCase().replace(/\s+/g, '');
  const rule = CARE_CATEGORY_RULES.find((r) => r.keywords.some((k) => normalized.includes(k)));
  return rule?.category ?? '기타';
}

/** 카탈로그 실제 제품 → 케어 제품 DTO. 구매 링크 없는 제품은 가짜 링크를 만들지 않기 위해 제외한다. */
function catalogToCareProduct(p: Product): CareProductDto | null {
  if (!p.purchaseUrl) return null;
  const name = `${p.brand} ${p.name}`.trim();
  return {
    name,
    url: p.purchaseUrl,
    reason:
      '검증된 실제 제품 카탈로그에서 고른 기본 추천이에요. AI가 이보다 정확한 제품을 고르면 자동으로 교체돼요.',
    category: inferCareCategory(name),
    evidence: null,
  };
}

/** 만 나이. 생일이 아직 안 지났으면 1을 뺀다. */
function computeAge(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthdayThisYear =
    now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

/** morning 케어에 잘못 섞여 들어온 밤 시간대 단계(자기 전/저녁/세안 등)를 걸러낸다. */
function isBedtimePhase(phase: string): boolean {
  return (
    phase.includes('자기') ||
    phase.includes('저녁') ||
    phase.includes('밤') ||
    phase.includes('취침') ||
    phase.includes('세안')
  );
}

/**
 * weather/skin/combined 루틴의 phase는 "외출 후(세안 후)"/"자기 전" 두 값 고정 — 프롬프트로
 * 지시해도 LLM이 가끔 다른 문구를 쓰므로(제품 개수 지시 때와 같은 이유), 코드에서 표준 두 값
 * 중 하나로 정규화한다. "자기"/"취침"만 밤 시간대 신호로 본다 — "세안"은 "외출 후(세안 후)"
 * 라벨 자체에 포함된 단어라 밤 신호로 쓰면 정상 라벨까지 오분류된다.
 */
function normalizeFixedPhase(phase: string): (typeof CARE_FIXED_PHASES)[number] {
  return phase.includes('자기') || phase.includes('취침') ? CARE_FIXED_PHASES[1] : CARE_FIXED_PHASES[0];
}

interface RefreshOpts {
  refresh?: boolean;
  /** 화면에 이미 떠 있는 루틴 — 있으면 products만 새로 생성한다. */
  routine?: CarePlanDto['routine'];
  medicalDisclaimer?: string | null;
}

interface CareJobPayload {
  careKey: string;
  careType: CareType;
  diagnosisId?: string;
  lat?: number;
  lon?: number;
  /**
   * "다른 추천 보기" — 화면에 이미 떠 있는 루틴을 그대로 넘기면 routine은 재생성하지
   * 않고 products만 새로 찾는다(사용자가 방금 확인한 루틴이 새로고침마다 바뀌지 않게).
   */
  routineOverride?: CarePlanDto['routine'];
  medicalDisclaimerOverride?: string | null;
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
    private readonly catalog: ProductCatalogService,
    private readonly fastPath: FastPathCoordinator,
  ) {}

  /**
   * FALLBACK용 케어 플랜 — 시드 카탈로그의 실제 제품을 채워 첫 화면부터 제품이 보이게 한다.
   * AI(LIVE) 생성이 끝나면 이 제품으로 자동 교체된다. 카탈로그 로딩 실패는 전체 fallback을
   * 막지 않는다(제품 없이 루틴만 반환 — 빈 화면 금지 원칙은 유지).
   */
  private async fallbackPlan(careType: CareType): Promise<CarePlanDto> {
    const plan = fallbackCarePlan(careType);
    try {
      const catalog = await this.catalog.load();
      plan.products = catalog
        .map(catalogToCareProduct)
        .filter((p): p is CareProductDto => p !== null);
    } catch (e) {
      this.logger.debug(
        `fallback 카탈로그 로딩 실패 — 루틴만 반환: ${e instanceof Error ? e.message : String(e)}`,
      );
      plan.products = [];
    }
    return plan;
  }

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
    opts?: RefreshOpts,
  ): Promise<CarePlanFastResponseDto> {
    await this.assertDiagnosisOwnership(diagnosisId, userId);
    const careKey = `skin:${diagnosisId}`;
    return this.resolveFast(userId, 'skin', careKey, opts?.refresh, () =>
      this.enqueueCareJob(userId, 'skin', careKey, {
        diagnosisId,
        routineOverride: opts?.routine,
        medicalDisclaimerOverride: opts?.medicalDisclaimer,
      }),
    );
  }

  async getCombinedFast(
    userId: number,
    diagnosisId: string,
    opts?: RefreshOpts,
  ): Promise<CarePlanFastResponseDto> {
    await this.assertDiagnosisOwnership(diagnosisId, userId);
    const careKey = `combined:${diagnosisId}`;
    return this.resolveFast(userId, 'combined', careKey, opts?.refresh, () =>
      this.enqueueCareJob(userId, 'combined', careKey, {
        diagnosisId,
        routineOverride: opts?.routine,
        medicalDisclaimerOverride: opts?.medicalDisclaimer,
      }),
    );
  }

  /**
   * "다음날 아침" — 같은(최신) 진단의 피부 상태 + 오늘 실시간 날씨. combined와 달리
   * 진단에 연결된(그날의) 날씨가 아니라 지금 좌표 기준 실시간 날씨를 쓴다 — 그래서
   * careKey에 날짜를 넣어 날이 바뀌면 자연히 새로 생성되게 한다.
   */
  async getMorningFast(
    userId: number,
    diagnosisId: string,
    opts?: { lat?: number; lon?: number } & RefreshOpts,
  ): Promise<CarePlanFastResponseDto> {
    await this.assertDiagnosisOwnership(diagnosisId, userId);
    const careKey = `morning:${diagnosisId}:${todayKst()}`;
    return this.resolveFast(userId, 'morning', careKey, opts?.refresh, () =>
      this.enqueueCareJob(userId, 'morning', careKey, {
        diagnosisId,
        lat: opts?.lat,
        lon: opts?.lon,
        routineOverride: opts?.routine,
        medicalDisclaimerOverride: opts?.medicalDisclaimer,
      }),
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
    if (payload.routineOverride && payload.routineOverride.length > 0) {
      return this.generateProductsOnly(userId, careType, payload);
    }

    const skin = careType !== 'weather' ? await this.loadSkinInput(payload.diagnosisId!, userId) : null;
    const weather =
      careType !== 'skin' ? await this.loadWeatherInput(careType, payload) : null;
    const profile = await this.loadUserProfile(userId);

    const excludeKey = this.excludeKey(userId, careType);
    const excludeProducts = (await this.redis.getJson<string[]>(excludeKey)) ?? [];

    let generated = await this.openAiClient.generateCarePlan(careType, skin, weather, profile, excludeProducts);
    let plan = await this.postProcess(generated, careType, excludeProducts);

    if (plan.products.length === 0 && generated.products.length > 0) {
      this.logger.warn(
        `케어 플랜 후처리 후 제품 0개 — 같은 exclude로 1회 재요청 (careType=${careType})`,
      );
      const retryExclude = Array.from(
        new Set([...excludeProducts, ...generated.products.map((p) => p.name)]),
      );
      generated = await this.openAiClient.generateCarePlan(careType, skin, weather, profile, retryExclude);
      plan = await this.postProcess(generated, careType, retryExclude);
    }

    await this.appendExcludeList(excludeKey, plan.products.map((p) => p.name));
    return plan;
  }

  /**
   * "다른 추천 보기" 전용 경로 — routine은 payload.routineOverride를 그대로 돌려주고
   * products만 새로 생성한다. generateLive의 재시도·exclude 로직과 같은 정책을 쓰되
   * routine 생성 호출 자체가 없다(더 빠르고 싸다).
   */
  private async generateProductsOnly(
    userId: number,
    careType: CareType,
    payload: CareJobPayload,
  ): Promise<CarePlanDto> {
    const routine = payload.routineOverride!;
    const skin = careType !== 'weather' ? await this.loadSkinInput(payload.diagnosisId!, userId) : null;
    const weather = careType !== 'skin' ? await this.loadWeatherInput(careType, payload) : null;
    const profile = await this.loadUserProfile(userId);

    const excludeKey = this.excludeKey(userId, careType);
    const excludeProducts = (await this.redis.getJson<string[]>(excludeKey)) ?? [];
    const routineContext = routine.map((r) => ({
      phase: r.phase,
      step: r.step,
      ingredient: r.ingredient ?? null,
      amount: r.amount ?? null,
    }));

    let generatedProducts = await this.openAiClient.generateCareProducts(
      careType,
      routineContext,
      skin,
      weather,
      profile,
      excludeProducts,
    );
    let products = await this.filterAndValidateProducts(generatedProducts, excludeProducts);

    if (products.length === 0 && generatedProducts.length > 0) {
      this.logger.warn(
        `제품 전용 재생성 후처리 후 제품 0개 — 같은 exclude로 1회 재요청 (careType=${careType})`,
      );
      const retryExclude = Array.from(
        new Set([...excludeProducts, ...generatedProducts.map((p) => p.name)]),
      );
      generatedProducts = await this.openAiClient.generateCareProducts(
        careType,
        routineContext,
        skin,
        weather,
        profile,
        retryExclude,
      );
      products = await this.filterAndValidateProducts(generatedProducts, retryExclude);
    }

    await this.appendExcludeList(excludeKey, products.map((p) => p.name));

    return {
      careType,
      routine,
      products,
      medicalDisclaimer: payload.medicalDisclaimerOverride ?? null,
    };
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

  /** 나이/성별 둘 다 선택 입력이라 없을 수 있다 — 있는 것만 프롬프트에 실어 보낸다. */
  private async loadUserProfile(userId: number): Promise<UserProfileInput> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { birthDate: true, gender: true },
    });
    return {
      age: computeAge(user?.birthDate ?? null),
      gender: user?.gender ?? null,
    };
  }

  /**
   * weather/morning: 좌표 기반 실시간 날씨(서버 소유 계약, N12) — morning은 "오늘 아침"
   * 기준으로 매번 갱신되어야 하므로 진단에 연결된 과거 스냅샷이 아니라 지금 날씨를 쓴다.
   * combined: 그 진단에 실제로 연결된 WeatherSnapshot(diagnosis.weatherSnapshotId) —
   * "이 진단 당시의 날씨"라는 뜻이라 좌표를 받지 않는다(요청 바디에도 lat/lon이 없다).
   * 연결된 스냅샷이 없으면(외출 안 함) null — combined도 사실상 skin과 동일하게 처리된다.
   */
  private async loadWeatherInput(
    careType: CareType,
    payload: CareJobPayload,
  ): Promise<WeatherInput | null> {
    if (careType === 'weather' || careType === 'morning') {
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
   * 3. morning 전용: 프롬프트로 "자기 전 단계 넣지 마라"를 지시해도 LLM이 가끔
   *    어긴다(제품 개수 지시와 마찬가지로 프롬프트만으로는 100% 안 지켜짐) — 코드에서
   *    한 번 더 걸러낸다.
   */
  private async postProcess(
    generated: GeneratedCarePlan,
    careType: CareType,
    excludeProducts: string[],
  ): Promise<CarePlanDto> {
    const routineSource =
      careType === 'morning'
        ? generated.routine.filter((r) => !isBedtimePhase(r.phase))
        : generated.routine.map((r) => ({ ...r, phase: normalizeFixedPhase(r.phase) }));

    const [products, routine] = await Promise.all([
      this.filterAndValidateProducts(generated.products, excludeProducts),
      this.validateRoutineEvidence(routineSource),
    ]);

    return {
      careType,
      routine,
      products,
      medicalDisclaimer: generated.medicalDisclaimer,
    };
  }

  /** exclude 이름 필터 + 링크 검증 — 전체 재생성과 제품 전용 재생성이 공유한다. */
  private async filterAndValidateProducts(
    products: GeneratedCareProduct[],
    excludeProducts: string[],
  ): Promise<GeneratedCareProduct[]> {
    const excludeSet = new Set(excludeProducts.map(normalizeProductName));
    const afterExclude = products.filter((p) => !excludeSet.has(normalizeProductName(p.name)));
    return this.validateProducts(afterExclude);
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
      loadFallback: async () => [await this.fallbackPlan(careType)],
      enqueue,
    });

    return {
      source: result.source,
      jobId: result.jobId,
      generatedAt: result.generatedAt,
      plan: result.items[0] ?? (await this.fallbackPlan(careType)),
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
    extra: {
      diagnosisId?: string;
      lat?: number;
      lon?: number;
      routineOverride?: CarePlanDto['routine'];
      medicalDisclaimerOverride?: string | null;
    },
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
