import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

/**
 * N4/Inline dispatcher e2e 헬퍼 — 비동기 job을 종료 상태까지 polling한다.
 * 결과 단언 전에 job이 끝나도록 기다리며, 정리(사용자 삭제 등) 시 실행 중 job이
 * 남지 않게 하는 것이 목적이다. status가 PENDING이 아니면 즉시 반환한다.
 */
export async function waitForJob(
  app: INestApplication,
  accessToken: string,
  jobId: string,
  // N32: 일부 job은 재시도 backoff(attempts=3, 2s)로 FAILED/COMPLETED 전이에 ~6s 걸린다.
  // jest e2e testTimeout(30s) 안에서 충분히 기다리되, 실패 원인을 빨리 알 수 있게 15s로 제한한다.
  timeoutMs = 15000,
): Promise<{ status: string; result?: unknown; error?: string | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(app.getHttpServer())
      .get(`/jobs/${jobId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    if (res.body.status !== 'PENDING') {
      return res.body;
    }
    const { promise: sleepP, resolve: sleepR } = Promise.withResolvers<void>();
    setTimeout(sleepR, 50);
    await sleepP;
  }
  throw new Error(`job ${jobId} did not finish within ${timeoutMs}ms`);
}
