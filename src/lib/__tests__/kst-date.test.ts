import {
  currentMonthBounds,
  formatDateKo,
  formatKstDate,
  kstDaysAgo,
  monthBounds,
  recentKstDates,
  todayKst,
} from '../kst-date';

/**
 * R26: 서버(backend/src/modules/diagnosis/calendar-date.util.ts)와 같은 규칙인지
 * 확인한다. 특히 자정 경계 — 여기서 어긋나면 사용자가 다른 날의 데이터를 본다.
 */
describe('kst-date', () => {
  describe('formatKstDate', () => {
    it('UTC 15:00은 이미 다음 날 KST다', () => {
      expect(formatKstDate(new Date('2026-08-11T15:00:00Z'))).toBe('2026-08-12');
    });

    it('UTC 14:59는 아직 같은 날 KST다', () => {
      expect(formatKstDate(new Date('2026-08-11T14:59:59Z'))).toBe('2026-08-11');
    });

    it('KST 자정 직전/직후를 날짜 경계로 구분한다', () => {
      expect(formatKstDate(new Date('2026-08-12T00:00:00+09:00'))).toBe('2026-08-12');
      expect(formatKstDate(new Date('2026-08-11T23:59:59+09:00'))).toBe('2026-08-11');
    });

    it('숫자 타임스탬프도 받는다', () => {
      expect(formatKstDate(Date.parse('2026-01-01T00:00:00+09:00'))).toBe('2026-01-01');
    });
  });

  describe('kstDaysAgo', () => {
    it('월초에서 하루 전은 전달 말일이다', () => {
      expect(kstDaysAgo(1, '2026-08-01')).toBe('2026-07-31');
    });

    it('연초에서 하루 전은 전해 마지막 날이다', () => {
      expect(kstDaysAgo(1, '2026-01-01')).toBe('2025-12-31');
    });

    it('윤년 3월 1일의 하루 전은 2월 29일이다', () => {
      expect(kstDaysAgo(1, '2024-03-01')).toBe('2024-02-29');
    });

    it('0일 전은 그 날 자신이다', () => {
      expect(kstDaysAgo(0, '2026-08-12')).toBe('2026-08-12');
    });
  });

  describe('recentKstDates', () => {
    it('오늘을 첫 항목으로 과거 순으로 나열한다', () => {
      const days = recentKstDates(3);
      expect(days).toHaveLength(3);
      expect(days[0]).toBe(todayKst());
      expect(days[1]).toBe(kstDaysAgo(1));
      expect(days[2]).toBe(kstDaysAgo(2));
    });
  });

  describe('monthBounds', () => {
    it.each([
      ['2026-08', '2026-08-01', '2026-08-31'],
      ['2026-02', '2026-02-01', '2026-02-28'],
      ['2024-02', '2024-02-01', '2024-02-29'],
      ['2026-04', '2026-04-01', '2026-04-30'],
      ['2026-12', '2026-12-01', '2026-12-31'],
    ])('%s → %s ~ %s', (month, from, to) => {
      expect(monthBounds(month)).toEqual({ from, to });
    });

    it('currentMonthBounds는 오늘이 속한 달을 쓴다', () => {
      expect(currentMonthBounds()).toEqual(monthBounds(todayKst().slice(0, 7)));
    });
  });

  describe('formatDateKo', () => {
    it('앞자리 0을 떼고 한국어로 표기한다', () => {
      expect(formatDateKo('2026-08-01')).toBe('8월 1일');
      expect(formatDateKo('2026-12-25')).toBe('12월 25일');
    });
  });
});
