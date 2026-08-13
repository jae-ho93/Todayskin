import { Logger } from '@nestjs/common';
import { fetchWithTimeout } from '../weather/clients/fetch-with-timeout';

const logger = new Logger('CareLinkValidator');

/** HEAD 검증 타임아웃 — 쇼핑몰 응답이 느릴 수 있어 날씨 API보다 여유를 둔다. */
const LINK_CHECK_TIMEOUT_MS = 5_000;

/**
 * 명확히 죽은 링크(404/410/DNS 실패/타임아웃)만 dead로 판정한다.
 * 403/999 같은 봇 차단성 응답은 실제 쇼핑몰이 HEAD 요청·비브라우저 UA를 자주 막기
 * 때문에 살아있는 것으로 간주한다 — "실패하면 무조건 제거"보다 보수적으로 완화했다
 * (플랜의 알려진 리스크 항목, 실측으로 조정 가능).
 */
export async function isLinkDead(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, LINK_CHECK_TIMEOUT_MS, { method: 'HEAD' });
    if (res.status === 404 || res.status === 410) return true;
    // 일부 서버는 HEAD를 아예 지원하지 않고 405를 준다 — 이건 dead 신호가 아니다.
    return false;
  } catch (e) {
    logger.debug(`링크 검증 실패(dead 처리): ${url} — ${e instanceof Error ? e.message : String(e)}`);
    return true;
  }
}
