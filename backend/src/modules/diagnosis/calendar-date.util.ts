/**
 * N8 캘린더 날짜 유틸 — Asia/Seoul(UTC+9) 달력 기준.
 */

const KST_OFFSET = '+09:00';

export function isValidDateParam(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const start = new Date(`${value}T00:00:00${KST_OFFSET}`);
  if (Number.isNaN(start.getTime())) return false;
  return formatKstDate(start) === value;
}

/** Instant → Asia/Seoul YYYY-MM-DD */
export function formatKstDate(input: Date | number): string {
  const d = typeof input === 'number' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** 오늘(Asia/Seoul) YYYY-MM-DD */
export function todayKst(): string {
  return formatKstDate(new Date());
}

/** YYYY-MM-DD(Asia/Seoul) → [startInclusive, endExclusive) UTC Date */
export function kstDayRange(dateStr: string): { start: Date; endExclusive: Date } {
  const start = new Date(`${dateStr}T00:00:00${KST_OFFSET}`);
  const endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, endExclusive };
}

/** from/to inclusive KST day range as UTC Date bounds [start, endExclusive) */
export function kstInclusiveRange(
  from: string,
  to: string,
): { start: Date; endExclusive: Date } {
  const { start } = kstDayRange(from);
  const { endExclusive } = kstDayRange(to);
  return { start, endExclusive };
}

/** N일 전(Asia/Seoul) YYYY-MM-DD */
export function kstDaysAgo(days: number, from = todayKst()): string {
  const base = new Date(`${from}T00:00:00${KST_OFFSET}`);
  return formatKstDate(base.getTime() - days * 24 * 60 * 60 * 1000);
}
