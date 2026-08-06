import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PatternStatus } from './enums/pattern-status.enum';
import { CorrelationDirection } from './enums/correlation-direction.enum';
import { CorrelationStrength } from './enums/correlation-strength.enum';
import { PatternSummaryDto } from './dto/pattern-summary.dto';
import { PatternCorrelationDto } from './dto/pattern-correlation.dto';
import { FacePart } from '../diagnosis/enums/face-part.enum';
import { notDeletedWhere } from '../../common/soft-delete/soft-delete.policy';

/**
 * 분석 정책 (T10 "분석 대상, 결측값, 최소 샘플 수 정책 결정").
 *
 * - 최소 진단 샘플 수: 5. 이보다 적으면 LOCKED.
 * - 분석 대상 피부 지표: overallScore + 부위별 moisture/elasticity.
 * - 분석 대상 환경 지표: uvIndex, pm25, pm10, ozonePpm, caiValue.
 *   (정부 API 실패로 null인 경우가 많으므로, pairwise로 유효 쌍만 계산한다.)
 * - 결측값: 두 지표 모두 non-null인 진단만 쌍에 포함(pairwise deletion).
 * - 상관계수: 피어슨 r. 유효 쌍이 3개 미만이면 계산하지 않는다(통계적 의미 부족).
 * - |r| < 0.1(NEGLIGIBLE)은 결과에서 제외한다. 노이즈를 사용자에게 보여주지 않는다.
 */
const MIN_SAMPLES = 5;
const MIN_PAIRS_FOR_CORR = 3;
const NEGLIGIBLE_THRESHOLD = 0.1;

/**
 * C등급 추천과 연결. 패턴 분석 결과는 C등급(개인 시계열) 추천과 짝을 이룬다.
 * 현재는 사용자의 기존 C등급 추천 id를 참조용으로 반환한다.
 * C등급 추천 생성 자체는 별도 작업이며, 여기서는 연결만 담당한다.
 */
const C_GRADE_SOURCE_LABEL = '개인 시계열 통계적 관찰';
const CAUSALITY_DISCLAIMER = '이 결과는 통계적 관찰일 뿐 인과관계를 의미하지 않아요.';
const CORRELATION_OBS_NOTE = '이 관계는 통계적 관찰일 뿐 인과관계를 의미하지 않아요.';
const LOCKED_MESSAGE = `패턴 분석에는 최소 ${MIN_SAMPLES}회의 진단 데이터가 필요해요.`;

/**
 * 환경 지표 후보와 Prisma 필드 매핑. null 허용 필드만 후보로 삼는다.
 */
const ENV_METRICS: { key: string; field: keyof EnvRow }[] = [
  { key: 'uvIndex', field: 'uvIndex' },
  { key: 'pm25', field: 'pm25' },
  { key: 'pm10', field: 'pm10' },
  { key: 'ozonePpm', field: 'ozonePpm' },
  { key: 'caiValue', field: 'caiValue' },
];

type EnvRow = {
  uvIndex: number | null;
  pm25: number | null;
  pm10: number | null;
  ozonePpm: number | null;
  caiValue: number | null;
};

/**
 * PatternService — 개인 시계열 상관 분석 (T10).
 *
 * Diagnosis와 연결된 WeatherSnapshot을 조인해 시계열을 구성하고,
 * 피부 지표(overallScore, 부위별 moisture/elasticity)와 환경 지표(uvIndex, pm25, ...)
 * 사이의 피어슨 상관계수를 계산한다.
 *
 * 데이터 부족 시 404가 아닌 200 + LOCKED를 반환한다.
 * 상관관계와 인과관계를 구분하는 고정 문구를 포함한다.
 */
@Injectable()
export class PatternService {
  private readonly logger = new Logger(PatternService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 개인 패턴 분석.
   *
   * 1. 사용자 진단을 최신순으로 조회하고 weatherSnapshot을 포함한다.
   * 2. 진단 수가 MIN_SAMPLES 미만이면 LOCKED 응답.
   * 3. 피부 지표 × 환경 지표 쌍에 대해 피어슨 r을 계산(pairwise).
   * 4. |r| >= NEGLIGIBLE_THRESHOLD인 결과만 반환.
   * 5. 사용자의 C등급 추천 id를 함께 반환(연결).
   */
  async getPattern(userId: number): Promise<PatternSummaryDto> {
    const diagnoses = await this.prisma.diagnosis.findMany({
      where: notDeletedWhere({ userId, weatherSnapshotId: { not: null } }),
      orderBy: { capturedAt: 'asc' },
      include: {
        skinMetrics: true,
        weatherSnapshot: true,
      },
    });

    const collectedDays = this.countDistinctDays(diagnoses.map((d) => d.capturedAt));

    // 1) LOCKED — 데이터 부족. 404가 아닌 200 + LOCKED.
    if (diagnoses.length < MIN_SAMPLES) {
      return {
        status: PatternStatus.LOCKED,
        collectedDays,
        requiredDays: MIN_SAMPLES,
        lockedMessage: LOCKED_MESSAGE,
        correlations: [],
        recommendationIds: [],
      };
    }

    // 2) 시계열 구성. weatherSnapshot이 있는 진단만 사용.
    const series = diagnoses
      .filter((d) => d.weatherSnapshot !== null)
      .map((d) => ({
        capturedAt: d.capturedAt,
        overallScore: d.overallScore,
        metrics: d.skinMetrics,
        env: d.weatherSnapshot as EnvRow | null,
      }))
      .filter((s) => s.env !== null) as SeriesPoint[];

    // 3) 피부 지표 × 환경 지표 상관 계산.
    const correlations = this.computeCorrelations(series);

    // 4) C등급 추천 연결. 사용자의 기존 C등급 추천 id를 참조용으로 반환.
    const recommendationIds = await this.getCGradeRecommendationIds(userId);

    return {
      status: PatternStatus.READY,
      collectedDays,
      requiredDays: MIN_SAMPLES,
      observationalDisclaimer: CAUSALITY_DISCLAIMER,
      correlations,
      recommendationIds,
    };
  }

  // ── 상관 계산 ──────────────────────────────────

  /**
   * 피부 지표(overallScore + 부위별 moisture/elasticity) × 환경 지표 쌍의
   * 피어슨 상관계수를 계산한다. pairwise deletion으로 결측을 처리한다.
   */
  private computeCorrelations(series: SeriesPoint[]): PatternCorrelationDto[] {
    const results: PatternCorrelationDto[] = [];

    const skinMetrics = this.collectSkinMetricSeries(series);
    const envMetrics = this.collectEnvMetricSeries(series);

    for (const skin of skinMetrics) {
      for (const env of envMetrics) {
        const pairs = this.pairValues(skin.values, env.values);
        if (pairs.length < MIN_PAIRS_FOR_CORR) continue;

        const r = pearson(pairs);
        if (Number.isNaN(r)) continue;
        if (Math.abs(r) < NEGLIGIBLE_THRESHOLD) continue;

        results.push({
          skinMetric: skin.key,
          part: skin.part ?? null,
          envMetric: env.key,
          r: round(r, 3),
          direction: this.directionOf(r),
          strength: this.strengthOf(r),
          sampleSize: pairs.length,
          observationalNote: CORRELATION_OBS_NOTE,
        });
      }
    }

    // 강한 순으로 정렬해 사용자에게 가장 의미 있는 관계를 먼저 보여준다.
    return results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  }

  /**
   * 피부 지표 시계열을 추출한다.
   * - overallScore: 모든 진단에 존재.
   * - 부위별 moisture/elasticity: null이 아닌 경우만.
   */
  private collectSkinMetricSeries(
    series: SeriesPoint[],
  ): { key: string; part: FacePart | null; values: (number | null)[] }[] {
    const out: { key: string; part: FacePart | null; values: (number | null)[] }[] = [];

    // overallScore — 부위 없음.
    out.push({
      key: 'overallScore',
      part: null,
      values: series.map((s) => s.overallScore),
    });

    // 부위별 moisture/elasticity. 부위는 시계열 순서대로 정렬된 진단 기준으로 매칭.
    // 각 부위에 대해 진단 순서대로 값을 모은다.
    const parts = new Set<FacePart>();
    series.forEach((s) => s.metrics.forEach((m) => parts.add(m.part)));

    for (const part of parts) {
      out.push({
        key: 'moisture',
        part,
        values: series.map((s) => {
          const m = s.metrics.find((x) => x.part === part);
          return m?.moisture ?? null;
        }),
      });
      out.push({
        key: 'elasticity',
        part,
        values: series.map((s) => {
          const m = s.metrics.find((x) => x.part === part);
          return m?.elasticity ?? null;
        }),
      });
    }

    return out;
  }

  /**
   * 환경 지표 시계열을 추출한다. 각 지표는 진단 순서대로 정렬된 값 배열.
   */
  private collectEnvMetricSeries(
    series: SeriesPoint[],
  ): { key: string; values: (number | null)[] }[] {
    return ENV_METRICS.map((m) => ({
      key: m.key,
      values: series.map((s) => s.env[m.field]),
    }));
  }

  /**
   * 두 배열에서 같은 인덱스의 non-null 쌍만 추출(pairwise deletion).
   */
  private pairValues(a: (number | null)[], b: (number | null)[]): [number, number][] {
    const out: [number, number][] = [];
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const x = a[i];
      const y = b[i];
      if (x !== null && y !== null && !Number.isNaN(x) && !Number.isNaN(y)) {
        out.push([x, y]);
      }
    }
    return out;
  }

  private directionOf(r: number): CorrelationDirection {
    if (r > NEGLIGIBLE_THRESHOLD) return CorrelationDirection.POSITIVE;
    if (r < -NEGLIGIBLE_THRESHOLD) return CorrelationDirection.NEGATIVE;
    return CorrelationDirection.NEUTRAL;
  }

  private strengthOf(r: number): CorrelationStrength {
    const abs = Math.abs(r);
    if (abs >= 0.7) return CorrelationStrength.STRONG;
    if (abs >= 0.4) return CorrelationStrength.MODERATE;
    if (abs >= NEGLIGIBLE_THRESHOLD) return CorrelationStrength.WEAK;
    return CorrelationStrength.NEGLIGIBLE;
  }

  // ── C등급 추천 연결 ──────────────────────────────

  /**
   * 사용자의 C등급 추천 id 목록. 패턴 분석과 짝을 이루는 C등급(개인 시계열) 추천.
   * 현재는 기존 추천을 참조용으로 반환한다. 생성은 별도 작업.
   */
  private async getCGradeRecommendationIds(userId: number): Promise<string[]> {
    const recs = await this.prisma.recommendation.findMany({
      where: { userId, grade: 'C' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return recs.map((r) => r.id);
  }

  // ── 유틸 ──────────────────────────────────

  /**
   * 고유 날짜(YYYY-MM-DD 기준) 수. collectedDays 계산용.
   * 진단 캡처 시각의 날짜가 다르면 별도 일수로 센다.
   */
  private countDistinctDays(dates: Date[]): number {
    const days = new Set<string>();
    for (const d of dates) {
      days.add(d.toISOString().slice(0, 10));
    }
    return days.size;
  }
}

/**
 * 시계열 한 점. 진단 시각, 종합 점수, 부위별 측정값, 환경 스냅샷.
 */
interface SeriesPoint {
  capturedAt: Date;
  overallScore: number;
  metrics: { part: FacePart; moisture: number | null; elasticity: number | null }[];
  env: EnvRow;
}

/**
 * 피어슨 상관계수. 표본 표준편차를 사용한다.
 * pairs 길이 < 2이면 NaN을 반환해 호출자가 건너뛰게 한다.
 */
function pearson(pairs: [number, number][]): number {
  const n = pairs.length;
  if (n < 2) return NaN;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pairs) {
    sx += x;
    sy += y;
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dxx = 0;
  let dyy = 0;
  for (const [x, y] of pairs) {
    const dx = x - mx;
    const dy = y - my;
    num += dx * dy;
    dxx += dx * dx;
    dyy += dy * dy;
  }
  const denom = Math.sqrt(dxx * dyy);
  if (denom === 0) return NaN;
  return num / denom;
}

function round(v: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export { MIN_SAMPLES, C_GRADE_SOURCE_LABEL, CAUSALITY_DISCLAIMER };
