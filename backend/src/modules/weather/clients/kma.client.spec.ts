import { todayRemainingSlots } from './kma.client';

/**
 * N39 회귀 방지.
 *
 * `todayRemainingSlots`가 돌려주는 시각은 KST여야 하고, 이 값은 **테스트를 실행하는
 * 머신의 타임존에 영향을 받으면 안 된다.** 과거에 KST 개발 머신에서만 자외선 최고
 * 시각이 9시간 밀려 보이던 버그가 있었다. 운영 컨테이너는 TZ 미설정(UTC)이라
 * 증상이 드러나지 않았고, 그래서 UTC에서만 도는 테스트로는 이 버그를 못 잡는다.
 */
describe('todayRemainingSlots', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    setTz(originalTz);
  });

  /**
   * Node는 `process.env.TZ` 대입 시 V8의 타임존 캐시를 무효화한다. 이후 생성되는
   * Date의 로컬 게터가 바뀌므로, 이걸로 다른 타임존 머신을 흉내 낼 수 있다.
   */
  function setTz(tz: string | undefined): void {
    if (tz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = tz;
    }
  }

  // UTC 기준 2026-08-13T03:00:00Z = KST 12:00. 최고 자외선이 나오는 한낮이라
  // N39 증상(12시 → 21시)이 그대로 드러나는 시각이다.
  const noonKst = new Date('2026-08-13T03:00:00Z');

  it.each(['UTC', 'Asia/Seoul', 'America/New_York', 'Pacific/Kiritimati'])(
    'TZ=%s 에서도 KST 시각을 돌려준다',
    (tz) => {
      setTz(tz);

      const slots = todayRemainingSlots(noonKst);

      // KST 12:00부터 자정 전까지 3시간 격자 → 12, 15, 18, 21
      expect(slots.map(([, hour]) => hour)).toEqual([12, 15, 18, 21]);
      expect(slots.map(([offset]) => offset)).toEqual([0, 3, 6, 9]);
    },
  );

  it('KST 자정을 넘는 슬롯은 포함하지 않는다', () => {
    setTz('Asia/Seoul');

    // KST 22:00 — 다음 슬롯(01:00)은 다음 날이라 잘려야 한다
    const lateKst = new Date('2026-08-13T13:00:00Z');

    expect(todayRemainingSlots(lateKst).map(([, hour]) => hour)).toEqual([22]);
  });

  it('KST 자정 직후에는 그날 슬롯 전체를 돌려준다', () => {
    setTz('Asia/Seoul');

    // KST 00:00 — 00, 03, ... 21 까지 8개
    const midnightKst = new Date('2026-08-12T15:00:00Z');

    expect(todayRemainingSlots(midnightKst).map(([, hour]) => hour)).toEqual([
      0, 3, 6, 9, 12, 15, 18, 21,
    ]);
  });

  it('UTC 날짜 경계와 KST 날짜 경계를 혼동하지 않는다', () => {
    setTz('UTC');

    // KST 2026-08-13 09:00 = UTC 2026-08-13 00:00.
    // UTC 기준으로 날짜가 막 바뀐 시점이라, UTC 날짜로 자르면 결과가 달라진다.
    const morningKst = new Date('2026-08-13T00:00:00Z');

    expect(todayRemainingSlots(morningKst).map(([, hour]) => hour)).toEqual([
      9, 12, 15, 18, 21,
    ]);
  });
});
