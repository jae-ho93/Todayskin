import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

/**
 * N2 e2e 테스트 헬퍼.
 * OTP 발송→검증→가입/로그인 흐름을 캡슐화한다.
 *
 * 테스트는 OTP_ALLOWLIST_PHONES에 등록된 번호를 사용해 고정 OTP(123456)로
 * 검증 흐름을 자동화한다. 운영에서는 이 경로를 사용하지 않는다.
 */

const FIXED_OTP = '123456';

export async function signupWithOtp(
  app: INestApplication,
  phone: string,
  body: { name: string; birthDate: string; gender?: string },
): Promise<request.Response> {
  await request(app.getHttpServer())
    .post('/otp/send')
    .send({ phoneNumber: phone, purpose: 'signup' })
    .expect(200);
  await request(app.getHttpServer())
    .post('/otp/verify')
    .send({ phoneNumber: phone, purpose: 'signup', code: FIXED_OTP })
    .expect(200);
  return request(app.getHttpServer())
    .post('/auth/signup')
    .send({ phoneNumber: phone, ...body });
}

export async function loginWithOtp(
  app: INestApplication,
  phone: string,
): Promise<request.Response> {
  await request(app.getHttpServer())
    .post('/otp/send')
    .send({ phoneNumber: phone, purpose: 'login' })
    .expect(200);
  await request(app.getHttpServer())
    .post('/otp/verify')
    .send({ phoneNumber: phone, purpose: 'login', code: FIXED_OTP })
    .expect(200);
  return request(app.getHttpServer())
    .post('/auth/login')
    .send({ phoneNumber: phone });
}
