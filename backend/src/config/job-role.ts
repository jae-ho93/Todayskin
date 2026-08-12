import { ConfigService } from '@nestjs/config';

/**
 * R13: 프로세스 역할.
 *
 * 같은 이미지로 두 종류의 프로세스를 띄운다. 잡 처리(Gemini 호출·상품 매칭·패턴
 * 계산)가 API 요청과 같은 이벤트 루프를 쓰면 p99 응답 지연을 직접 밀어올리고,
 * 두 워크로드의 스케일 축(API 트래픽 vs 큐 적체)이 다른데 하나로 묶인다.
 *
 * - `both`(기본): HTTP + BullMQ 워커 + 백그라운드 스케줄러. 현재 동작이며
 *   로컬·테스트·단일 서비스 배포가 이 값을 쓴다.
 * - `api`: enqueue만 한다. 워커와 스케줄러를 띄우지 않는다.
 * - `worker`: 워커와 스케줄러를 띄운다. ALB 뒤에 두지 않으므로 HTTP는
 *   헬스체크용으로만 쓰인다.
 *
 * **전환 순서가 중요하다**: `api`로 먼저 바꾸면 워커 서비스가 생기기 전까지
 * 잡이 큐에 쌓인 채 처리되지 않고 스케줄러도 멈춘다. worker 서비스를 먼저
 * 띄우고 그 다음 API를 `api`로 내린다 (docs/DEPLOYMENT.md).
 */
export type JobRole = 'api' | 'worker' | 'both';

export const DEFAULT_JOB_ROLE: JobRole = 'both';

export function resolveJobRole(config: ConfigService): JobRole {
  const raw = (config.get<string>('JOB_ROLE') ?? DEFAULT_JOB_ROLE).trim();
  return raw === 'api' || raw === 'worker' ? raw : DEFAULT_JOB_ROLE;
}

/** 잡을 직접 처리하는 역할인지 (BullMQ Worker 생성 여부). */
export function processesJobs(role: JobRole): boolean {
  return role !== 'api';
}

/** 백그라운드 스케줄러(정리·수집·재시도)를 돌리는 역할인지. */
export function runsSchedulers(role: JobRole): boolean {
  return role !== 'api';
}
