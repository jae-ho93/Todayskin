import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CareService } from './care.service';
import { OpenAiClient } from '../openai/openai.client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { JobService } from '../jobs/job.service';
import { JobStateService } from '../jobs/job-state.service';
import { FastPathCoordinator } from '../jobs/fast-path.coordinator';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { WeatherService } from '../weather/weather.service';
import { WeatherSource } from '../../common/enums/weather-source.enum';
import { JobStatus } from '../jobs/enums/job-status.enum';
import * as linkValidator from './care-link-validator';

// 실제 네트워크 HEAD 요청 없이 링크 검증 결과를 제어한다.
jest.mock('./care-link-validator', () => ({
  isLinkDead: jest.fn(),
}));

/**
 * CareService 단위 테스트.
 * 빠른 경로(N32/N29 패턴 재사용), 진단 소유권 검사, LIVE 생성 후처리
 * (exclude 필터·링크 검증·제품 0개 시 재요청·exclude 세션 갱신)를 검증한다.
 */
describe('CareService', () => {
  let service: CareService;
  let openAiClient: { generateCarePlan: jest.Mock; generateCareProducts: jest.Mock };
  let weatherService: { resolveServerWeather: jest.Mock; getSnapshotById: jest.Mock };
  let redis: { getJson: jest.Mock; setJson: jest.Mock; invalidate: jest.Mock };
  let jobService: { enqueue: jest.Mock };
  let jobState: { findRecentByDedupeKey: jest.Mock };
  let idempotency: { acquire: jest.Mock; complete: jest.Mock; release: jest.Mock };
  let prisma: {
    diagnosis: { findFirst: jest.Mock; findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  const isLinkDead = linkValidator.isLinkDead as jest.Mock;

  const liveWeather = () => ({
    source: WeatherSource.LIVE,
    observedAt: '2026-08-14T06:00:00.000Z',
    regionName: '서울특별시',
    uvIndex: 8,
    uvStatus: 'high',
    uvIndexPeak: null,
    uvStatusPeak: null,
    uvIndexPeakHour: null,
    ozonePpm: null,
    ozoneStatus: null,
    pm25: 20,
    pm25Status: 'moderate',
    pm10: null,
    pm10Status: null,
    caiValue: null,
    caiStatus: null,
    no2Value: null,
    so2Value: null,
    coValue: null,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    isLinkDead.mockResolvedValue(false);

    openAiClient = { generateCarePlan: jest.fn(), generateCareProducts: jest.fn() };
    weatherService = {
      resolveServerWeather: jest.fn().mockResolvedValue(liveWeather()),
      getSnapshotById: jest.fn(),
    };
    redis = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(true),
      invalidate: jest.fn().mockResolvedValue(true),
    };
    jobService = {
      enqueue: jest.fn().mockResolvedValue({ jobId: 'job-care-1', status: JobStatus.PENDING }),
    };
    jobState = { findRecentByDedupeKey: jest.fn().mockResolvedValue(null) };
    idempotency = {
      acquire: jest.fn().mockResolvedValue({ outcome: 'acquired' }),
      complete: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      diagnosis: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ birthDate: null, gender: null }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CareService,
        { provide: OpenAiClient, useValue: openAiClient },
        { provide: WeatherService, useValue: weatherService },
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: JobService, useValue: jobService },
        { provide: JobStateService, useValue: jobState },
        { provide: IdempotencyService, useValue: idempotency },
        FastPathCoordinator,
      ],
    }).compile();

    service = moduleRef.get(CareService);
  });

  describe('getWeatherFast', () => {
    it('캐시·job 없으면 FALLBACK 반환 + LIVE job enqueue', async () => {
      const result = await service.getWeatherFast(1, { lat: 37.5, lon: 127 });
      expect(result.source).toBe('FALLBACK');
      expect(result.jobId).toBe('job-care-1');
      expect(result.plan.routine.length).toBeGreaterThan(0);
      expect(jobService.enqueue).toHaveBeenCalledWith(
        1,
        'CARE_GENERATE',
        expect.objectContaining({ careType: 'weather' }),
      );
    });

    it('refresh=true면 캐시를 무효화하고 dedupeKey 없이 새 job을 만든다', async () => {
      await service.getWeatherFast(1, { lat: 37.5, lon: 127, refresh: true });
      expect(redis.invalidate).toHaveBeenCalled();
      // dedupeKey를 안 넘기면 FastPathCoordinator가 job 재사용 조회를 건너뛴다.
      expect(jobState.findRecentByDedupeKey).not.toHaveBeenCalled();
    });
  });

  describe('getSkinFast / getCombinedFast', () => {
    it('진단이 없거나 다른 사용자 소유면 404', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue(null);
      await expect(service.getSkinFast(1, 'diag-1')).rejects.toThrow(NotFoundException);
    });

    it('소유권 확인 후 FALLBACK + job enqueue', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({ id: 'diag-1' });
      const result = await service.getSkinFast(1, 'diag-1');
      expect(result.source).toBe('FALLBACK');
      expect(jobService.enqueue).toHaveBeenCalledWith(
        1,
        'CARE_GENERATE',
        expect.objectContaining({ careType: 'skin', diagnosisId: 'diag-1' }),
      );
    });
  });

  describe('getMorningFast', () => {
    it('진단이 없거나 다른 사용자 소유면 404', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue(null);
      await expect(service.getMorningFast(1, 'diag-1')).rejects.toThrow(NotFoundException);
    });

    it('진단의 피부 상태 + 좌표 기준 실시간 날씨로 job을 enqueue한다', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({ id: 'diag-1' });
      const result = await service.getMorningFast(1, 'diag-1', { lat: 37.5, lon: 127 });
      expect(result.source).toBe('FALLBACK');
      expect(jobService.enqueue).toHaveBeenCalledWith(
        1,
        'CARE_GENERATE',
        expect.objectContaining({ careType: 'morning', diagnosisId: 'diag-1', lat: 37.5, lon: 127 }),
      );
    });
  });

  describe('generateLive', () => {
    const generatedPlan = (products: { name: string; url: string }[]) => ({
      routine: [
        {
          phase: '아침',
          step: '보습',
          ingredient: '히알루론산',
          amount: '2방울',
          reason: '오늘 피부 상태를 고려해 보습이 도움될 수 있어요.',
          evidence: null,
        },
      ],
      products: products.map((p) => ({ ...p, reason: '오늘 상태에 적합해요.', evidence: null })),
      medicalDisclaimer: null,
    });

    it('링크가 살아있는 제품만 남기고 exclude 세션에 반영한다', async () => {
      openAiClient.generateCarePlan.mockResolvedValue(
        generatedPlan([{ name: '제품A', url: 'https://a.example.com' }]),
      );
      isLinkDead.mockResolvedValue(false);

      const plan = await service.generateLive(1, 'weather', {
        careKey: 'weather:서울특별시:2026-08-14',
        careType: 'weather',
        lat: 37.5,
        lon: 127,
      });

      expect(plan.products).toHaveLength(1);
      expect(redis.setJson).toHaveBeenCalledWith(
        'care:exclude:1:weather',
        ['제품A'],
        24 * 60 * 60,
      );
    });

    it('사용자의 생년월일·성별로 나이를 계산해 [프로필]로 OpenAiClient에 넘긴다', async () => {
      // 실행 시점과 무관하게 항상 "생일이 지난 만 28세"가 되도록 오늘 날짜 기준으로 역산한다.
      const today = new Date();
      const birthDate = new Date(Date.UTC(today.getUTCFullYear() - 28, 0, 1));
      prisma.user.findUnique.mockResolvedValue({ birthDate, gender: 'female' });
      openAiClient.generateCarePlan.mockResolvedValue(generatedPlan([]));

      await service.generateLive(1, 'weather', {
        careKey: 'weather:서울특별시:2026-08-14',
        careType: 'weather',
        lat: 37.5,
        lon: 127,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { birthDate: true, gender: true },
      });
      expect(openAiClient.generateCarePlan).toHaveBeenCalledWith(
        'weather',
        null,
        expect.objectContaining({ uvIndex: 8 }),
        { age: 28, gender: 'female' },
        [],
      );
    });

    it('exclude 필터링 후 제품이 0개면 같은 exclude로 1회 재요청한다', async () => {
      redis.getJson.mockResolvedValueOnce(['제품A']); // 기존 exclude 목록
      openAiClient.generateCarePlan
        .mockResolvedValueOnce(generatedPlan([{ name: '제품A', url: 'https://a.example.com' }])) // 1차: exclude와 겹침
        .mockResolvedValueOnce(generatedPlan([{ name: '제품B', url: 'https://b.example.com' }])); // 2차: 재요청 성공

      const plan = await service.generateLive(1, 'weather', {
        careKey: 'weather:서울특별시:2026-08-14',
        careType: 'weather',
        lat: 37.5,
        lon: 127,
      });

      expect(openAiClient.generateCarePlan).toHaveBeenCalledTimes(2);
      expect(plan.products).toHaveLength(1);
      expect(plan.products[0].name).toBe('제품B');
    });

    it('죽은 링크의 제품은 제거되고, evidence만 죽었으면 제품은 유지하되 evidence만 비운다', async () => {
      openAiClient.generateCarePlan.mockResolvedValue({
        routine: [
          {
            phase: '아침',
            step: '보습',
            ingredient: null,
            amount: null,
            reason: '보습이 도움될 수 있어요.',
            evidence: { sourceName: 'WHO', sourceUrl: 'https://dead-who.example.com', sourceType: 'WHO' },
          },
        ],
        products: [
          { name: '살아있는 제품', url: 'https://alive.example.com', reason: 'r', evidence: null },
          { name: '죽은 제품', url: 'https://dead.example.com', reason: 'r', evidence: null },
        ],
        medicalDisclaimer: null,
      });
      isLinkDead.mockImplementation((url: string) => Promise.resolve(url.includes('dead')));

      const plan = await service.generateLive(1, 'weather', {
        careKey: 'weather:서울특별시:2026-08-14',
        careType: 'weather',
        lat: 37.5,
        lon: 127,
      });

      // 제품 링크가 죽으면 제품 자체가 제거된다.
      expect(plan.products.map((p) => p.name)).toEqual(['살아있는 제품']);
      // 근거 URL만 죽으면 루틴 단계 자체는 남기고 evidence만 비운다.
      expect(plan.routine[0].evidence).toBeNull();
    });

    it('weather/skin/combined은 phase를 "외출 후(세안 후)"/"자기 전" 두 값으로 정규화한다', async () => {
      openAiClient.generateCarePlan.mockResolvedValue({
        routine: [
          { phase: '아침', step: '보습', ingredient: null, amount: null, reason: 'r', evidence: null },
          { phase: '외출 후(세안 후)', step: '세럼', ingredient: null, amount: null, reason: 'r', evidence: null },
          { phase: '취침 전 마무리', step: '크림', ingredient: null, amount: null, reason: 'r', evidence: null },
          { phase: '자기 전', step: '수분팩', ingredient: null, amount: null, reason: 'r', evidence: null },
        ],
        products: [],
        medicalDisclaimer: null,
      });

      const plan = await service.generateLive(1, 'weather', {
        careKey: 'weather:서울특별시:2026-08-14',
        careType: 'weather',
        lat: 37.5,
        lon: 127,
      });

      expect(plan.routine.map((r) => r.phase)).toEqual([
        '외출 후(세안 후)',
        '외출 후(세안 후)', // "세안"이 들어있어도 밤 신호로 오분류되지 않는다
        '자기 전',
        '자기 전',
      ]);
    });

    it('morning은 combined와 달리 진단에 연결된 스냅샷이 아니라 좌표 기준 실시간 날씨를 쓴다', async () => {
      prisma.diagnosis.findFirst.mockResolvedValue({
        id: 'diag-1',
        capturedAt: new Date(),
        overallScore: 70,
        acneReport: null,
        diseaseClassification: null,
        skinMetrics: [],
      });
      openAiClient.generateCarePlan.mockResolvedValue(generatedPlan([]));

      await service.generateLive(1, 'morning', {
        careKey: 'morning:diag-1:2026-08-14',
        careType: 'morning',
        diagnosisId: 'diag-1',
        lat: 37.5,
        lon: 127,
      });

      expect(weatherService.resolveServerWeather).toHaveBeenCalledWith(37.5, 127);
      expect(weatherService.getSnapshotById).not.toHaveBeenCalled();
      expect(prisma.diagnosis.findUnique).not.toHaveBeenCalled();
    });

    describe('routineOverride — "다른 추천 보기"는 루틴을 그대로 두고 제품만 새로 생성한다', () => {
      const fixedRoutine = [
        {
          phase: '아침',
          step: '보습',
          ingredient: '히알루론산',
          amount: '2방울',
          reason: '기존 루틴 그대로',
          detail: '기존 detail 그대로',
          evidence: null,
        },
      ];

      it('generateCarePlan을 호출하지 않고 generateCareProducts만 호출하며, routine을 그대로 돌려준다', async () => {
        openAiClient.generateCareProducts.mockResolvedValue([
          { name: '새 제품', url: 'https://new.example.com', reason: 'r', evidence: null },
        ]);

        const plan = await service.generateLive(1, 'weather', {
          careKey: 'weather:서울특별시:2026-08-14',
          careType: 'weather',
          lat: 37.5,
          lon: 127,
          routineOverride: fixedRoutine,
          medicalDisclaimerOverride: '기존 문구 그대로',
        });

        expect(openAiClient.generateCarePlan).not.toHaveBeenCalled();
        expect(openAiClient.generateCareProducts).toHaveBeenCalledWith(
          'weather',
          [{ phase: '아침', step: '보습', ingredient: '히알루론산', amount: '2방울' }],
          null,
          expect.objectContaining({ uvIndex: 8 }),
          { age: null, gender: null },
          [],
        );
        expect(plan.routine).toEqual(fixedRoutine);
        expect(plan.medicalDisclaimer).toBe('기존 문구 그대로');
        expect(plan.products).toEqual([
          { name: '새 제품', url: 'https://new.example.com', reason: 'r', evidence: null },
        ]);
      });

      it('제품 0개로 걸러지면 같은 exclude로 1회 재요청한다', async () => {
        redis.getJson.mockResolvedValueOnce([]); // 기존 exclude 목록
        openAiClient.generateCareProducts
          .mockResolvedValueOnce([{ name: '제품A', url: 'https://a.example.com', reason: 'r', evidence: null }])
          .mockResolvedValueOnce([{ name: '제품B', url: 'https://b.example.com', reason: 'r', evidence: null }]);
        isLinkDead.mockImplementation((url: string) => Promise.resolve(url.includes('a.example')));

        const plan = await service.generateLive(1, 'weather', {
          careKey: 'weather:서울특별시:2026-08-14',
          careType: 'weather',
          lat: 37.5,
          lon: 127,
          routineOverride: fixedRoutine,
        });

        expect(openAiClient.generateCareProducts).toHaveBeenCalledTimes(2);
        expect(plan.products.map((p) => p.name)).toEqual(['제품B']);
      });
    });
  });
});
