import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { ConsentPurpose } from '../../src/modules/consent/enums/consent-purpose.enum';

/**
 * N3 e2e 헬퍼 — 동의 upsert.
 */
export async function grantConsent(
  app: INestApplication,
  accessToken: string,
  purpose: ConsentPurpose,
): Promise<void> {
  const res = await request(app.getHttpServer())
    .post('/consents')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ purpose, agreed: true, source: 'app' });
  if (res.status !== 200) {
    throw new Error(
      `동의 실패 purpose=${purpose} status=${res.status} body=${JSON.stringify(res.body)}`,
    );
  }
}

export async function grantDiagnosisProcessing(
  app: INestApplication,
  accessToken: string,
): Promise<void> {
  await grantConsent(
    app,
    accessToken,
    ConsentPurpose.DIAGNOSIS_IMAGE_PROCESSING,
  );
}

export async function grantRecommendationTransfer(
  app: INestApplication,
  accessToken: string,
): Promise<void> {
  await grantConsent(
    app,
    accessToken,
    ConsentPurpose.AI_RECOMMENDATION_DATA_TRANSFER,
  );
}
