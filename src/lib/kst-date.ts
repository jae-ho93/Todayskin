/**
 * R26: Asia/Seoul(UTC+9) 달력 날짜 유틸 — 프론트 단일 출처.
 *
 * 서버는 히스토리·캘린더 집계를 전부 Asia/Seoul 기준으로 수행한다
 * (backend/src/modules/diagnosis/calendar-date.util.ts). 클라이언트가 다른 기준으로
 * 날짜를 만들면 자정 근처에서 사용자가 다른 날의 데이터를 보게 되므로,
 * 여기서 서버와 같은 규칙(Intl timeZone)을 쓴다.
 */

/** Instant → Asia/Seoul YYYY-MM-DD */
export function formatKstDate(input: Date | number = new Date()): string {
  const date = typeof input === 'number' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** 오늘(Asia/Seoul) YYYY-MM-DD */
export function todayKst(): string {
  return formatKstDate();
}

/** 오늘부터 과거로 count일치 YYYY-MM-DD 목록 (오늘이 첫 항목) */
export function recentKstDates(count: number): string[] {
  const today = todayKst();
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    days.push(kstDaysAgo(i, today));
  }
  return days;
}

/** N일 전(Asia/Seoul) YYYY-MM-DD */
export function kstDaysAgo(days: number, from: string = todayKst()): string {
  const base = new Date(`${from}T00:00:00+09:00`);
  return formatKstDate(base.getTime() - days * 86400 * 1000);
}

/** 'YYYY-MM' → 그 달의 첫날/마지막날 (서버 from/to는 both inclusive) */
export function monthBounds(month: string): { from: string; to: string } {
  const [year, value] = month.split('-').map(Number);
  // Date(y, m, 0)은 m월의 마지막 날을 로컬 달력으로 만든다. 연·월·일 성분만 읽으므로
  // 실행 환경 시간대와 무관하게 같은 값이 나온다.
  const lastDay = new Date(year, value, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** 오늘이 속한 달의 범위 */
export function currentMonthBounds(): { from: string; to: string } {
  return monthBounds(todayKst().slice(0, 7));
}

/** '2026-08-01' → '8월 1일' — 캘린더·추이의 날짜 표기를 한 곳에서 맞춘다. */
export function formatDateKo(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${month}월 ${day}일`;
}

/**
 * F66: 촬영 시각(instant) → '2026.08.13' (Asia/Seoul).
 *
 * 기록 화면에는 `2026년 8월 13일 오전 3:41 촬영`처럼 떴다. 한 줄이 길어 여러 기록을
 * 훑을 때 날짜만 빨리 비교하기 어려웠다. 0을 채워 자리수를 고정해야 목록에서 세로가
 * 맞으므로 `formatKstDate`(en-CA, 2-digit)를 그대로 쓰고 구분자만 바꾼다.
 *
 * 화면 파일에 있던 표기 함수를 여기로 옮겼다. 화면마다 따로 두면 표기가 갈라진다.
 */
export function formatCapturedDate(iso: string): string {
  return formatKstDate(new Date(iso)).replace(/-/g, '.');
}
