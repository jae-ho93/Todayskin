import {
  formatKstDate,
  isValidDateParam,
  kstDayRange,
  kstDaysAgo,
  kstInclusiveRange,
  todayKst,
} from './calendar-date.util';

describe('calendar-date.util', () => {
  it('validates YYYY-MM-DD and rejects invalid calendar dates', () => {
    expect(isValidDateParam('2026-08-06')).toBe(true);
    expect(isValidDateParam('2026-02-30')).toBe(false);
    expect(isValidDateParam('2026/08/06')).toBe(false);
    expect(isValidDateParam('08-06')).toBe(false);
  });

  it('builds exclusive KST day range spanning 24h', () => {
    const { start, endExclusive } = kstDayRange('2026-08-06');
    expect(endExclusive.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    // 2026-08-06 00:00 KST == 2026-08-05 15:00 UTC
    expect(start.toISOString()).toBe('2026-08-05T15:00:00.000Z');
  });

  it('formats instants as Asia/Seoul calendar dates', () => {
    // UTC evening that is next calendar day in KST
    expect(formatKstDate(new Date('2026-08-05T16:00:00.000Z'))).toBe('2026-08-06');
  });

  it('builds inclusive ranges and days-ago helpers', () => {
    const { start, endExclusive } = kstInclusiveRange('2026-08-01', '2026-08-03');
    expect(start.toISOString()).toBe('2026-07-31T15:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-08-03T15:00:00.000Z');
    expect(kstDaysAgo(1, '2026-08-06')).toBe('2026-08-05');
    expect(typeof todayKst()).toBe('string');
  });
});
