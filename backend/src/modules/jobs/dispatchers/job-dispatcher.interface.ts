import { JobType } from '../enums/job-type.enum';
import type { AppQueueName } from '../jobs.constants';

export interface DispatchJobInput {
  jobId: string;
  type: JobType;
  queueName: AppQueueName;
  userId: number;
  payload: Record<string, unknown>;
  priority: number;
  attempts: number;
  backoffDelayMs: number;
}

/**
 * Job 디스패처 추상화.
 * - BullMQ: REDIS_URL 있을 때
 * - Inline: Redis 없거나 테스트 환경 (동일 PENDING→COMPLETED 계약 유지)
 */
export interface QueueMetrics {
  /** 큐별 대기/처리중/완료/실패/지연 건수. 비활성(Inline)이면 null. */
  queues: Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }>;
  /** DLQ 대기 건수 */
  dlqWaiting: number;
}

export interface JobDispatcher {
  /** 큐에 job을 넣고, BullMQ job id가 있으면 반환 */
  dispatch(input: DispatchJobInput): Promise<string | null>;
  /** N11: queue/DLQ 운영 지표. 지원하지 않으면 null 반환. */
  collectMetrics?(): Promise<QueueMetrics | null>;
  /** 모듈 종료 시 연결 정리 */
  close?(): Promise<void>;
}
