import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_JOB_ROLE,
  processesJobs,
  resolveJobRole,
  runsSchedulers,
} from './job-role';

function configWith(value?: string): ConfigService {
  return { get: () => value } as unknown as ConfigService;
}

describe('job-role (R13)', () => {
  it('기본값은 both — 기존 단일 서비스 동작을 유지한다', () => {
    expect(DEFAULT_JOB_ROLE).toBe('both');
    expect(resolveJobRole(configWith(undefined))).toBe('both');
  });

  it('api/worker를 인식하고 공백을 무시한다', () => {
    expect(resolveJobRole(configWith('api'))).toBe('api');
    expect(resolveJobRole(configWith(' worker '))).toBe('worker');
  });

  it('알 수 없는 값은 both로 떨어진다 (오타로 워커가 사라지지 않는다)', () => {
    expect(resolveJobRole(configWith('API'))).toBe('both');
    expect(resolveJobRole(configWith('workers'))).toBe('both');
    expect(resolveJobRole(configWith(''))).toBe('both');
  });

  it('api는 잡 처리와 스케줄러를 하지 않는다', () => {
    expect(processesJobs('api')).toBe(false);
    expect(runsSchedulers('api')).toBe(false);
  });

  it('worker/both는 잡 처리와 스케줄러를 담당한다', () => {
    for (const role of ['worker', 'both'] as const) {
      expect(processesJobs(role)).toBe(true);
      expect(runsSchedulers(role)).toBe(true);
    }
  });
});
