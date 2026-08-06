/**
 * N4 job 상태 계약: PENDING → COMPLETED | FAILED
 * (BACKEND_TASKS.md N4)
 */
export enum JobStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
