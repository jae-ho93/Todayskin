/**
 * Soft Delete 공통 쿼리/보존 정책 (N6, N44 개정).
 *
 * - 활성 레코드: deletedAt IS NULL
 * - 탈퇴 시: User는 deletedAt=now, purgeAfter=now+retention (계정 껍데기만 유예)
 * - 개인정보/원본 이미지: 즉시 물리 삭제(스크럽)
 * - 진단 결과·추천: **즉시 물리 삭제** (N44 — 익명 보존하지 않는다)
 *
 * N44 이전에는 진단을 익명화해 보존했다. 화면에서는 사라지지만 얼굴 분석 결과가
 * DB에 계속 남아, "탈퇴 시 즉시 파기"라는 처리방침 문구와 어긋났다.
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
