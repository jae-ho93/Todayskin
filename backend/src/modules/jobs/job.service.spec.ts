import { Test } from '@nestjs/testing';
import { JOB_DISPATCHER } from './jobs.constants';
import { JobService } from './job.service';
import { JobStateService } from './job-state.service';
import { JobStatus } from './enums/job-status.enum';
import { JobType } from './enums/job-type.enum';
import { EnqueueJobResponseDto } from './dto/job-response.dto';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('JobService (Inline)', () => {
  let service: JobService;
  let state: Record<string, any>;
  let dispatcher: Record<string, any>;

  beforeEach(async () => {
    state = {
      create: jest.fn().mockResolvedValue({ id: 'job-1' }),
      setBullJobId: jest.fn(),
      markStarted: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
      getForUser: jest.fn(),
    };
    dispatcher = { dispatch: jest.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        JobService,
        { provide: JobStateService, useValue: state },
        { provide: JOB_DISPATCHER, useValue: dispatcher },
      ],
    }).compile();
    service = moduleRef.get(JobService);
  });

  it('enqueue 후 즉시 PENDING 응답을 반환한다', async () => {
    const res = await service.enqueue(1, JobType.RECOMMENDATION_GENERATE, {
      diagnosisId: 'd1',
    });
    expect(res).toEqual<EnqueueJobResponseDto>({
      jobId: 'job-1',
      status: JobStatus.PENDING,
    });
    expect(state.create).toHaveBeenCalled();
    expect(dispatcher.dispatch).toHaveBeenCalled();
  });

  it('dispatch 실패 시 job을 FAILED(deadLetter)로 마킹하고 throw', async () => {
    dispatcher.dispatch.mockRejectedValue(new Error('queue down'));
    await expect(
      service.enqueue(1, JobType.RECOMMENDATION_GENERATE, {}),
    ).rejects.toThrow('queue down');
    expect(state.markFailed).toHaveBeenCalledWith(
      'job-1',
      expect.stringContaining('queue down'),
      true,
    );
  });
});