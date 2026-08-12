/**
 * R23: 정부 API 클라이언트 3곳(KMA·AirKorea·Station)에 같은 구현이 복제돼 있었다.
 * 타임아웃 정책을 바꿀 때 세 곳을 함께 고쳐야 했고, 새 클라이언트는 네 번째 사본을
 * 만들 가능성이 높았다.
 */
export async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
