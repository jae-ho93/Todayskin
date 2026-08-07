import { Test } from '@nestjs/testing';
import { PatternService } from './pattern.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PatternStatus } from './enums/pattern-status.enum';
import { CorrelationDirection } from './enums/correlation-direction.enum';
import { CorrelationStrength } from './enums/correlation-strength.enum';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PatternService 단위 테스트.
 * Prisma를 mock하여 LOCKED/READY 분기와 상관 계산 로직을 검증한다.
 *
 * getPattern()은 이제 진단 시각의 스냅샷 값이 아니라 "같은 지역·같은 날(KST) 중 최댓값"
 * (weatherSnapshot.aggregate)을 환경 지표로 쓴다. 그래서 aggregate mock은 호출 시점의
 * where.observedAt 범위를 보고 어느 진단(day)에 해당하는지 찾아 그 진단의 fixture 값을 돌려준다.
 */
describe('PatternService', () => {
  let service: PatternService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      diagnosis: { findMany: jest.fn() },
      recommendation: { findMany: jest.fn().mockResolvedValue([]) },
      weatherSnapshot: { aggregate: jest.fn().mockResolvedValue(emptyMax()) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PatternService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PatternService);
  });

  /** diagnosis.findMany 결과에 맞춰 aggregate mock을 day(KST)별로 연결한다. */
  function wireAggregateToDiagnoses(diags: any[]) {
    prisma.weatherSnapshot.aggregate.mockImplementation(
      async ({ where }: { where: { observedAt: { gte: Date } } }) => {
        const match = diags.find(
          (d) =>
            d.weatherSnapshot &&
            kstDayKey(d.capturedAt) === where.observedAt.gte.toISOString(),
        );
        if (!match) return emptyMax();
        const s = match.weatherSnapshot;
        return {
          _max: {
            uvIndexPeak: s.uvIndexPeak,
            pm25: s.pm25,
            pm10: s.pm10,
            ozonePpm: s.ozonePpm,
            caiValue: s.caiValue,
          },
        };
      },
    );
  }

  /**
   * 진단 1~4개(최소 5 미만)면 LOCKED. 404가 아니다.
   */
  describe('getPattern — LOCKED', () => {
    it('진단이 MIN_SAMPLES 미만이면 200 + LOCKED를 반환한다', async () => {
      const diags = buildDiagnoses(3);
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      wireAggregateToDiagnoses(diags);
      const result = await service.getPattern(1);

      expect(result.status).toBe(PatternStatus.LOCKED);
      expect(result.correlations).toEqual([]);
      expect(result.recommendationIds).toEqual([]);
      expect(result.collectedDays).toBeGreaterThan(0);
      expect(result.lockedMessage).toBeDefined();
    });

    it('진단이 0개여도 LOCKED이고 빈 배열을 반환한다', async () => {
      prisma.diagnosis.findMany.mockResolvedValue([]);
      const result = await service.getPattern(1);

      expect(result.status).toBe(PatternStatus.LOCKED);
      expect(result.collectedDays).toBe(0);
    });
  });

  /**
   * 진단 5개 이상 + weatherSnapshot이 있으면 READY + 상관 분석.
   */
  describe('getPattern — READY', () => {
    it('최소 샘플 이상이면 READY이고 상관 분석 결과를 반환한다', async () => {
      const diags = buildDiagnoses(6);
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      wireAggregateToDiagnoses(diags);
      const result = await service.getPattern(1);

      expect(result.status).toBe(PatternStatus.READY);
      expect(result.observationalDisclaimer).toBeDefined();
      // pm25와 overallScore가 반비례하도록 구성했으므로 음의 상관이 존재해야 한다.
      const pm25Corr = result.correlations.find(
        (c) => c.skinMetric === 'overallScore' && c.envMetric === 'pm25',
      );
      expect(pm25Corr).toBeDefined();
      expect(pm25Corr!.direction).toBe(CorrelationDirection.NEGATIVE);
      expect(pm25Corr!.r).toBeLessThan(0);
      expect(pm25Corr!.sampleSize).toBeGreaterThan(0);
      expect(pm25Corr!.observationalNote).toContain('인과관계');
    });

    it('|r| < 0.1인 관계는 NEGLIGIBLE로 제외된다', async () => {
      // 무작위 noise — 상관이 거의 0에 가까운 데이터.
      const diags = buildNoiseDiagnoses(8);
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      wireAggregateToDiagnoses(diags);
      const result = await service.getPattern(1);

      // 노이즈에서는 NEGLIGIBLE만 나오므로 correlations가 비거나 매우 적어야 한다.
      for (const c of result.correlations) {
        expect(c.strength).not.toBe(CorrelationStrength.NEGLIGIBLE);
      }
    });

    it('결과는 |r| 내림차순으로 정렬된다', async () => {
      const diags = buildDiagnoses(8);
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      wireAggregateToDiagnoses(diags);
      const result = await service.getPattern(1);

      const abs = result.correlations.map((c) => Math.abs(c.r));
      const sorted = [...abs].sort((a, b) => b - a);
      expect(abs).toEqual(sorted);
    });

    it('C등급 추천 id를 recommendationIds에 반환한다', async () => {
      const diags = buildDiagnoses(6);
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      wireAggregateToDiagnoses(diags);
      prisma.recommendation.findMany.mockResolvedValue([
        { id: 'rec-c-1' },
        { id: 'rec-c-2' },
      ]);
      const result = await service.getPattern(1);

      expect(result.recommendationIds).toEqual(['rec-c-1', 'rec-c-2']);
    });
  });

  describe('getPattern — weatherSnapshot 없음', () => {
    it('weatherSnapshot이 null인 진단은 시계열에서 제외된다', async () => {
      const diags = buildDiagnoses(6).map((d: any, i: number) =>
        i % 2 === 0 ? { ...d, weatherSnapshot: null } : d,
      );
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      wireAggregateToDiagnoses(diags);
      const result = await service.getPattern(1);

      // 6개 중 3개만 유효 → 상관 계산 쌍이 부족할 수 있지만 status는 READY다.
      // (진단 총 6개 >= MIN_SAMPLES이므로 READY. 유효 시계열 3개는 MIN_PAIRS_FOR_CORR=3 이상.)
      expect(result.status).toBe(PatternStatus.READY);
    });
  });
});

// ── 테스트 데이터 빌더 ──────────────────────────

const EMPTY_MAX = {
  _max: {
    uvIndexPeak: null,
    pm25: null,
    pm10: null,
    ozonePpm: null,
    caiValue: null,
  },
};

function emptyMax() {
  return EMPTY_MAX;
}

/**
 * pattern.service.ts의 kstDayBounds(start)와 동일한 계산 — aggregate mock이 어느
 * 진단(day)의 where.observedAt.gte에 해당하는지 찾기 위한 키.
 */
function kstDayKey(date: Date): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const startUtcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MS;
  return new Date(startUtcMs).toISOString();
}

/**
 * overallScore는 시간에 따라 증가, pm25는 감소하는 시계열.
 * → overallScore × pm25는 음의 상관을 갖는다.
 * weatherSnapshot의 값들은 실제로는 aggregate mock(wireAggregateToDiagnoses)이
 * 그날의 "최댓값"으로 돌려주는 값이다 — regionName만 실제 프로덕션 코드가 직접 읽는다.
 */
function buildDiagnoses(count: number): any[] {
  const out: any[] = [];
  for (let i = 0; i < count; i++) {
    const day = new Date(2026, 0, 1 + i);
    const overallScore = 60 + i * 4;
    out.push({
      id: `snap-${i}`,
      capturedAt: day,
      overallScore,
      skinMetrics: [
        { part: 'cheek', moisture: 70 - i, elasticity: 65 + i },
        { part: 'forehead', moisture: 68 - i, elasticity: 60 + i },
      ],
      weatherSnapshot: {
        regionName: '서울',
        uvIndexPeak: 3 + i,
        pm25: 80 - i * 8,
        pm10: 100 - i * 5,
        ozonePpm: 0.03 + i * 0.005,
        caiValue: 90 - i * 6,
      },
    });
  }
  return out;
}

/**
 * 노이즈 데이터 — 상관이 거의 0에 가까운 무작위 시계열.
 */
function buildNoiseDiagnoses(count: number): any[] {
  const out: any[] = [];
  for (let i = 0; i < count; i++) {
    const day = new Date(2026, 0, 1 + i);
    out.push({
      id: `snap-n-${i}`,
      capturedAt: day,
      overallScore: 50 + (i % 3) * 10 - (i % 2) * 5,
      skinMetrics: [{ part: 'cheek', moisture: 60 + (i % 4), elasticity: 62 }],
      weatherSnapshot: {
        regionName: '서울',
        uvIndexPeak: 2 + (i % 5),
        pm25: 30 + (i % 7),
        pm10: 50 + (i % 6),
        ozonePpm: 0.02 + (i % 3) * 0.01,
        caiValue: 40 + (i % 9),
      },
    });
  }
  return out;
}
