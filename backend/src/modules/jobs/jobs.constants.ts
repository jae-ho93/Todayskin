import { JobType } from './enums/job-type.enum';

/** BullMQ / inline dispatcher 주입 토큰 */
export const JOB_DISPATCHER = Symbol('JOB_DISPATCHER');

/** 큐 이름 */
export const QUEUE_RECOMMENDATION = 'recommendation';
export const QUEUE_PATTERN = 'pattern';
export const QUEUE_NOTIFICATION = 'notification';
export const QUEUE_DLQ = 'dlq';

export type AppQueueName =
  | typeof QUEUE_RECOMMENDATION
  | typeof QUEUE_PATTERN
  | typeof QUEUE_NOTIFICATION
  | typeof QUEUE_DLQ;

/**
 * job 우선순위·재시도·backoff 정책.
 * priority: 낮을수록 먼저 처리 (BullMQ 규칙).
 */
export const JOB_POLICIES: Record<
  JobType,
  {
    queueName: Exclude<AppQueueName, typeof QUEUE_DLQ>;
    priority: number;
    attempts: number;
    backoffDelayMs: number;
  }
> = {
  [JobType.RECOMMENDATION_GENERATE]: {
    queueName: QUEUE_RECOMMENDATION,
    priority: 1,
    attempts: 3,
    backoffDelayMs: 2_000,
  },
  // N31/N29: 날씨 기반 제품 LIVE 생성 — 추천과 같은 큐(우선순위 동일).
  [JobType.WEATHER_PRODUCTS_GENERATE]: {
    queueName: QUEUE_RECOMMENDATION,
    priority: 1,
    attempts: 3,
    backoffDelayMs: 2_000,
  },
  // 케어 루틴+제품 LIVE 생성 — web_search 포함이라 호출이 오래 걸릴 수 있어 재시도는 2회로 낮춘다.
  [JobType.CARE_GENERATE]: {
    queueName: QUEUE_RECOMMENDATION,
    priority: 1,
    attempts: 2,
    backoffDelayMs: 3_000,
  },
  [JobType.PATTERN_ANALYZE]: {
    queueName: QUEUE_PATTERN,
    priority: 5,
    attempts: 2,
    backoffDelayMs: 1_000,
  },
  [JobType.NOTIFICATION_SEND]: {
    queueName: QUEUE_NOTIFICATION,
    priority: 10,
    attempts: 5,
    backoffDelayMs: 3_000,
  },
};
