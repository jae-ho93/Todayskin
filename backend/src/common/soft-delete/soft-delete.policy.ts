/**
 * Soft Delete 공통 쿼리/보존 정책 (N6).
 *
 * - 활성 레코드: deletedAt IS NULL
 * - 탈퇴/삭제 시: deletedAt=now, purgeAfter=now+retention
 * - 개인정보/원본 이미지: 즉시 물리 삭제(스크럽)
 * - 진단 결과: 익명화 후 보존 (User purge 시 userId SetNull)
 */
export const SOFT_DELETE_RETENTION_DAYS_DEFAULT = 30;

export function notDeletedWhere<T extends Record<string, unknown> = Record<string, unknown>>(
  extra?: T,
): T & { deletedAt: null } {
  return { ...(extra ?? ({} as T)), deletedAt: null };
}

export function computePurgeAfter(
  from: Date,
  retentionDays: number = SOFT_DELETE_RETENTION_DAYS_DEFAULT,
): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + retentionDays);
  return d;
}

/** Soft-deleted 사용자 전화번호 충돌 방지를 위한 익명 식별자. */
export function anonymizedPhone(userId: number): string {
  return `deleted:${userId}:${Date.now()}`;
}

export function anonymizedDisplayName(): string {
  return 'deleted';
}

/** 법적 최소 생년 — PII 스크럽용 고정값. */
export function anonymizedBirthDate(): Date {
  return new Date(Date.UTC(1970, 0, 1));
}
