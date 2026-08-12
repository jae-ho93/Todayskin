import { ConfigService } from '@nestjs/config';
import {
  KmaClient,
  latLonToGrid,
  nowcastBaseTime,
  todayRemainingSlots,
} from './kma.client';

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

// ── N53: 초단기실황 ────────────────────────────────────────────────

describe('latLonToGrid (N53)', () => {
  it('기상청 가이드 기준점: 서울 종로(37.5735, 126.9788) → (60, 127)', () => {
    expect(latLonToGrid(37.5735, 126.9788)).toEqual({ nx: 60, ny: 127 });
  });

  it('부산(35.1796, 129.0756) → (98, 76)', () => {
    expect(latLonToGrid(35.1796, 129.0756)).toEqual({ nx: 98, ny: 76 });
  });

  it('제주(33.4996, 126.5312) → (53, 38)', () => {
    expect(latLonToGrid(33.4996, 126.5312)).toEqual({ nx: 53, ny: 38 });
  });
});

describe('nowcastBaseTime (N53)', () => {
  it('KST 40분 이후에는 그 시각 정시 자료를 조회한다', () => {
    // UTC 03:45 = KST 12:45 → base 1200
    expect(nowcastBaseTime(new Date('2026-08-13T03:45:00Z'))).toEqual({
      date: '20260813',
      time: '1200',
    });
  });

  it('KST 40분 전에는 이전 정시 자료를 조회한다 (발표 지연 회피)', () => {
    // UTC 03:10 = KST 12:10 → 12시 자료가 아직 없을 수 있어 1100
    expect(nowcastBaseTime(new Date('2026-08-13T03:10:00Z'))).toEqual({
      date: '20260813',
      time: '1100',
    });
  });

  it('KST 자정 직후에는 전날 23시 자료로 넘어간다', () => {
    // UTC 15:20 = KST 다음날 00:20 → 전날 2300
    expect(nowcastBaseTime(new Date('2026-08-13T15:20:00Z'))).toEqual({
      date: '20260813',
      time: '2300',
    });
  });
});

describe('KmaClient.fetchNowcast (N53)', () => {
  const config = (key: string) =>
    ({ get: () => key }) as unknown as ConfigService;

  const nowcastResponse = (items: Array<{ category: string; obsrValue: string }>) => ({
    ok: true,
    json: async () => ({ response: { body: { items: { item: items } } } }),
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('T1H/REH를 기온·습도로 파싱하고 발표 시각을 관측 시각으로 쓴다', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      nowcastResponse([
        { category: 'T1H', obsrValue: '27.3' },
        { category: 'REH', obsrValue: '68' },
        { category: 'RN1', obsrValue: '0' },
      ]),
    ) as unknown as typeof fetch;

    const client = new KmaClient(config('test-key'));
    const result = await client.fetchNowcast(37.5735, 126.9788);

    expect(result.temperature).toBe(27.3);
    expect(result.humidity).toBe(68);
    expect(result.failed).toBe(false);
    expect(result.observedAt).toBeInstanceOf(Date);
    // 요청 URL에 격자 좌표(nx=60, ny=127)가 들어간다.
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('nx=60');
    expect(url).toContain('ny=127');
  });

  it('HTTP 오류는 failed=true (재시도 가치가 있는 실패)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;

    const client = new KmaClient(config('test-key'));
    const result = await client.fetchNowcast(37.5735, 126.9788);

    expect(result).toEqual({
      temperature: null,
      humidity: null,
      observedAt: null,
      failed: true,
    });
  });

  it('API 키가 없으면 호출 없이 빈 결과(failed=false)를 반환한다', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    const client = new KmaClient(config(''));
    const result = await client.fetchNowcast(37.5735, 126.9788);

    expect(result.failed).toBe(false);
    expect(result.temperature).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('응답에 실황 항목이 없으면 빈 결과(failed=false) — 재시도해도 같다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { body: {} } }),
    }) as unknown as typeof fetch;

    const client = new KmaClient(config('test-key'));
    const result = await client.fetchNowcast(37.5735, 126.9788);

    expect(result.failed).toBe(false);
    expect(result.temperature).toBeNull();
    expect(result.humidity).toBeNull();
  });
});
