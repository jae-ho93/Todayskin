/**
 * R23: 정부 API 클라이언트 3곳(KMA·AirKorea·Station)에 같은 구현이 복제돼 있었다.
 * 타임아웃 정책을 바꿀 때 세 곳을 함께 고쳐야 했고, 새 클라이언트는 네 번째 사본을
 * 만들 가능성이 높았다.
 *
 * `method`는 케어 링크 검증(HEAD 요청)이 이 헬퍼를 재사용하기 위해 추가했다 — 새
 * 타임아웃 구현을 또 만들지 않는다.
 */
export async function fetchWithTimeout(
  url: string,
  ms: number,
  opts?: { method?: string },
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { method: opts?.method ?? 'GET', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
