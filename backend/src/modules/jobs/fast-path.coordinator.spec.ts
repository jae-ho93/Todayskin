import { Test } from '@nestjs/testing';
import { RedisService } from '../../redis/redis.service';
import { JobStateService } from './job-state.service';
import { JobStatus } from './enums/job-status.enum';
import { JobType } from './enums/job-type.enum';
import {
  FastPathCoordinator,
  FastPathRequest,
  FAST_PATH_REVALIDATE_MS,
} from './fast-path.coordinator';

/**
 * R8: 추천/날씨 제품 두 화면이 공유하는 SWR 정책. 여기가 깨지면 두 화면이 함께
 * 깨지므로 우선순위(job 재사용 → 캐시 → fallback)를 도메인 없이 직접 검증한다.
 */
describe('FastPathCoordinator', () => {
  let coordinator: FastPathCoordinator;
  let redis: { getJson: jest.Mock; setJson: jest.Mock };
  let jobState: { findRecentByDedupeKey: jest.Mock };
  let enqueue: jest.Mock;
  let loadFallback: jest.Mock;

  beforeEach(async () => {
    redis = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(true),
    };
    jobState = { findRecentByDedupeKey: jest.fn().mockResolvedValue(null) };
    enqueue = jest.fn().mockResolvedValue('job-new');
    loadFallback = jest.fn().mockResolvedValue(['fallback']);

    const moduleRef = await Test.createTestingModule({
      providers: [
        FastPathCoordinator,
        { provide: RedisService, useValue: redis },
        { provide: JobStateService, useValue: jobState },
      ],
    }).compile();
    coordinator = moduleRef.get(FastPathCoordinator);
  });

  const request = (
    over: Partial<FastPathRequest<string>> = {},
  ): FastPathRequest<string> => ({
    userId: 1,
    jobType: JobType.RECOMMENDATION_GENERATE,
    dedupeKey: 'diagnosisId:diag-1',
    cacheKey: 'fast:1',
    readJobResult: (result) => (result as { items?: string[] } | null)?.items ?? [],
    loadFallback,
    enqueue,
    ...over,
  });

  it('miss → FALLBACK + LIVE job enqueue', async () => {
    const result = await coordinator.resolve(request());

    expect(result).toEqual({
      source: 'FALLBACK',
      jobId: 'job-new',
      items: ['fallback'],
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('캐시가 신선하면 CACHED만 반환하고 재검증 job을 만들지 않는다', async () => {
    redis.getJson.mockResolvedValue({
      items: ['cached'],
      generatedAt: new Date().toISOString(),
    });

    const result = await coordinator.resolve(request());

    expect(result.source).toBe('CACHED');
    expect(result.items).toEqual(['cached']);
    expect(result.jobId).toBeUndefined();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('캐시가 낡으면 CACHED를 먼저 주고 뒤에서 재검증 job을 붙인다 (SWR)', async () => {
    redis.getJson.mockResolvedValue({
      items: ['stale'],
      generatedAt: new Date(Date.now() - FAST_PATH_REVALIDATE_MS - 1000).toISOString(),
    });

    const result = await coordinator.resolve(request());

    expect(result.source).toBe('CACHED');
    expect(result.items).toEqual(['stale']);
    expect(result.jobId).toBe('job-new');
  });

  it('COMPLETED job 결과가 있으면 LIVE로 반환한다', async () => {
    jobState.findRecentByDedupeKey.mockResolvedValue({
      id: 'job-done',
      status: JobStatus.COMPLETED,
      finishedAt: new Date('2026-08-16T02:00:00Z'),
      result: { items: ['live'] },
    });

    const result = await coordinator.resolve(request());

    expect(result).toEqual({
      source: 'LIVE',
      jobId: 'job-done',
      generatedAt: '2026-08-16T02:00:00.000Z',
      items: ['live'],
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(redis.setJson).not.toHaveBeenCalled();
  });

  it('cacheLiveResult면 LIVE 결과를 SWR 캐시에도 적재한다', async () => {
    jobState.findRecentByDedupeKey.mockResolvedValue({
      id: 'job-done',
      status: JobStatus.COMPLETED,
      finishedAt: new Date(),
      result: { items: ['live'] },
    });

    await coordinator.resolve(request({ cacheLiveResult: true }));

    expect(redis.setJson).toHaveBeenCalledWith(
      'fast:1',
      expect.objectContaining({ items: ['live'] }),
      expect.any(Number),
    );
  });

  it('COMPLETED인데 결과가 비면 LIVE로 보지 않고 다음 단계로 내려간다', async () => {
    jobState.findRecentByDedupeKey.mockResolvedValue({
      id: 'job-empty',
      status: JobStatus.COMPLETED,
      finishedAt: new Date(),
      result: { items: [] },
    });

    const result = await coordinator.resolve(request());

    expect(result.source).toBe('FALLBACK');
    expect(result.jobId).toBe('job-new');
  });

  it('진행 중 job이 있으면 같은 jobId + FALLBACK으로 중복 enqueue를 막는다', async () => {
    jobState.findRecentByDedupeKey.mockResolvedValue({
      id: 'job-inflight',
      status: JobStatus.PENDING,
      finishedAt: null,
      result: null,
    });

    const result = await coordinator.resolve(request());

    expect(result.source).toBe('FALLBACK');
    expect(result.jobId).toBe('job-inflight');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('FAILED가 cooldown 안이면 같은 jobId를 재사용한다 (job 스팸 방지)', async () => {
    jobState.findRecentByDedupeKey.mockResolvedValue({
      id: 'job-failed',
      status: JobStatus.FAILED,
      finishedAt: new Date(),
      result: null,
    });

    const result = await coordinator.resolve(request());

    expect(result.jobId).toBe('job-failed');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('FAILED가 cooldown을 지나면 새 job을 만든다', async () => {
    jobState.findRecentByDedupeKey.mockResolvedValue({
      id: 'job-old-failed',
      status: JobStatus.FAILED,
      finishedAt: new Date(Date.now() - 60 * 60 * 1000),
      result: null,
    });

    const result = await coordinator.resolve(request());

    expect(result.jobId).toBe('job-new');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('dedupeKey가 없으면 job 재사용 단계를 건너뛴다 (추천 호환 모드)', async () => {
    const result = await coordinator.resolve(request({ dedupeKey: undefined }));

    expect(jobState.findRecentByDedupeKey).not.toHaveBeenCalled();
    expect(result.source).toBe('FALLBACK');
  });

  it('예전 형식이 남은 캐시는 miss로 보고 fallback을 만든다', async () => {
    // R8 이전에는 도메인마다 봉투 모양이 달랐다(예: { recommendations }).
    // 남아 있는 값을 빈 결과로 오해해 빈 화면을 보여주면 안 된다.
    redis.getJson.mockResolvedValue({
      recommendations: ['old'],
      generatedAt: new Date().toISOString(),
    });

    const result = await coordinator.resolve(request());

    expect(result.source).toBe('FALLBACK');
    expect(result.items).toEqual(['fallback']);
  });
});
