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
      weatherSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PatternService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PatternService);
  });

  /**
   * N21: 일괄 집계(findMany) mock — where.regionName.in에 해당하는 진단의 스냅샷을
   * (지역, 날짜)별 최댓값 계산용 원본 행으로 돌려준다.
   */
  function wireSnapshotsToDiagnoses(diags: any[]) {
    prisma.weatherSnapshot.findMany.mockImplementation(
      async ({ where }: { where: { regionName: { in: string[] } } }) =>
        diags
          .filter(
            (d) =>
              d.weatherSnapshot &&
              where.regionName.in.includes(d.weatherSnapshot.regionName),
          )
          .map((d) => ({
            regionName: d.weatherSnapshot.regionName,
            observedAt: d.capturedAt,
            uvIndexPeak: d.weatherSnapshot.uvIndexPeak,
            pm25: d.weatherSnapshot.pm25,
            pm10: d.weatherSnapshot.pm10,
            ozonePpm: d.weatherSnapshot.ozonePpm,
            caiValue: d.weatherSnapshot.caiValue,
          })),
    );
  }

  /**
   * 진단 1~4개(최소 5 미만)면 LOCKED. 404가 아니다.
   */
  describe('getPattern — LOCKED', () => {
    it('진단이 MIN_SAMPLES 미만이면 200 + LOCKED를 반환한다', async () => {
      const diags = buildDiagnoses(3);
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      wireSnapshotsToDiagnoses(diags);
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
      wireSnapshotsToDiagnoses(diags);
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
      wireSnapshotsToDiagnoses(diags);
      const result = await service.getPattern(1);

      // 노이즈에서는 NEGLIGIBLE만 나오므로 correlations가 비거나 매우 적어야 한다.
      for (const c of result.correlations) {
        expect(c.strength).not.toBe(CorrelationStrength.NEGLIGIBLE);
      }
    });

    it('결과는 |r| 내림차순으로 정렬된다', async () => {
      const diags = buildDiagnoses(8);
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      wireSnapshotsToDiagnoses(diags);
      const result = await service.getPattern(1);

      const abs = result.correlations.map((c) => Math.abs(c.r));
      const sorted = [...abs].sort((a, b) => b - a);
      expect(abs).toEqual(sorted);
    });

    it('C등급 추천 id를 recommendationIds에 반환한다', async () => {
      const diags = buildDiagnoses(6);
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      wireSnapshotsToDiagnoses(diags);
      prisma.recommendation.findMany.mockResolvedValue([
        { id: 'rec-c-1' },
        { id: 'rec-c-2' },
      ]);
      const result = await service.getPattern(1);

      expect(result.recommendationIds).toEqual(['rec-c-1', 'rec-c-2']);
    });
  });

  describe('getPattern — weatherSnapshot 없음 (N21 실내 사용자 폴백)', () => {
    it('weatherSnapshot이 없는 진단도 기본 지역 스냅샷으로 시계열에 포함된다', async () => {
      // 실내 사용자 — 모든 진단에 스냅샷이 없다. 기본 지역(서울특별시) 스냅샷만 존재.
      const diags = buildDiagnoses(6);
      const noSnapshot = diags.map((d: any) => ({ ...d, weatherSnapshot: null }));
      prisma.diagnosis.findMany.mockResolvedValue(noSnapshot);
      prisma.weatherSnapshot.findMany.mockResolvedValue(
        diags.map((d: any) => ({
          regionName: '서울특별시',
          observedAt: d.capturedAt,
          uvIndexPeak: d.weatherSnapshot.uvIndexPeak,
          pm25: d.weatherSnapshot.pm25,
          pm10: d.weatherSnapshot.pm10,
          ozonePpm: d.weatherSnapshot.ozonePpm,
          caiValue: d.weatherSnapshot.caiValue,
        })),
      );
      const result = await service.getPattern(1);

      // 스냅샷이 없어도 READY가 되고, 기본 지역 환경 데이터로 상관이 계산된다.
      expect(result.status).toBe(PatternStatus.READY);
      const pm25Corr = result.correlations.find(
        (c) => c.skinMetric === 'overallScore' && c.envMetric === 'pm25',
      );
      expect(pm25Corr).toBeDefined();
      expect(pm25Corr!.sampleSize).toBeGreaterThanOrEqual(3);
    });

    it('N21: collectedDays를 KST 달력일 기준으로 센다', async () => {
      // 서로 다른 UTC 날짜지만 같은 KST 날짜(2026-01-01)인 두 진단:
      // - 2025-12-31T16:00:00Z = KST 2026-01-01 01:00
      // - 2026-01-01T02:00:00Z = KST 2026-01-01 11:00
      // UTC 기준으론 2일, KST 기준 1일 — 기존 UTC 구현이었다면 2가 나와야 한다.
      const diags = [
        new Date('2025-12-31T16:00:00Z'),
        new Date('2026-01-01T02:00:00Z'),
      ].map((d, i) => ({
        id: `kst-${i}`,
        capturedAt: d,
        overallScore: 60,
        skinMetrics: [],
        weatherSnapshot: null,
      }));
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      const result = await service.getPattern(1);

      // 진단 2개 < MIN_SAMPLES → LOCKED지만 collectedDays는 KST 기준 1이어야 한다.
      expect(result.status).toBe(PatternStatus.LOCKED);
      expect(result.collectedDays).toBe(1);
    });

    it('N21: 일괄 집계 — 진단 수와 무관하게 weatherSnapshot을 정확히 1회만 조회한다', async () => {
      // N+1 회귀 방지: 6개 진단이어도 findMany는 1회여야 한다.
      const diags = buildDiagnoses(6);
      prisma.diagnosis.findMany.mockResolvedValue(diags);
      wireSnapshotsToDiagnoses(diags);
      await service.getPattern(1);

      expect(prisma.weatherSnapshot.findMany).toHaveBeenCalledTimes(1);
    });
  });
});

// ── 테스트 데이터 빌더 ──────────────────────────


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
