import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { signupWithOtp, loginWithOtp } from './helpers/auth-flow';

/**
 * Auth e2e 테스트.
 * 실제 test DB(todayskin_test)를 사용한다.
 * N2: 가입·로그인에 OTP 본인확인이 필수. 테스트는 allowlist 고정 OTP 사용.
 */
describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testPhone = '01077777777';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://todayskin:secret@localhost:5432/todayskin_test';
    process.env.JWT_ACCESS_SECRET = 'e2e_access_secret_at_least_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'e2e_refresh_secret_at_least_32_characters_long';
    process.env.ALLOWED_ORIGINS = '';
    // N2: OTP allowlist로 고정 OTP(123456) 사용. 운영 비활성.
    process.env.OTP_ALLOWLIST_PHONES = '01077777777,01044444444,01000000000';
    // N33: 소셜 토큰 검증을 mock으로 대체 (외부 API 없이 e2e).
    process.env.MOCK_SOCIAL = 'true';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    prisma = app.get(PrismaService);
    await app.init();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.refreshSession.deleteMany({});
    await prisma.otpCode.deleteMany({});
    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });
    await app.close();
    delete process.env.MOCK_SOCIAL;
  });

  beforeEach(async () => {
    await prisma.refreshSession.deleteMany({});
    await prisma.otpCode.deleteMany({});
    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });
  });

  describe('POST /auth/signup', () => {
    it('정상 가입 → 201, accessToken 포함', async () => {
      const res = await signupWithOtp(app, testPhone, {
        name: '이이보',
        birthDate: '1995-05-05',
      });
      expect(res.status).toBe(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.phoneNumber).toBe(testPhone);
      expect(res.body.name).toBe('이이보');
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.expiresIn).toBe(900);
    });

    it('중복 전화번호 → 409', async () => {
      await signupWithOtp(app, testPhone, {
        name: '이이보',
        birthDate: '1995-05-05',
      });

      // OTP 검증은 1회만 유효하므로, 두 번째 가입 시도 전 재발송/재검증.
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phoneNumber: testPhone, purpose: 'signup' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phoneNumber: testPhone, purpose: 'signup', code: '123456' })
        .expect(200);
      const dupRes = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
        });
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.detail).toContain('이미 가입된');
    });

    it('잘못된 전화번호 형식 → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: '02-123-4567',
          name: '이이보',
          birthDate: '1995-05-05',
        })
        .expect(400);
      expect(res.body.detail).toBeDefined();
    });

    it('gender 선택 필드 포함', async () => {
      const res = await signupWithOtp(app, testPhone, {
        name: '이이보',
        birthDate: '1995-05-05',
        gender: 'female',
      });
      expect(res.status).toBe(201);
      expect(res.body.gender).toBe('female');
    });

    it('gender 잘못된 값 → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
          gender: 'other',
        })
        .expect(400);
      expect(res.body.detail).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    it('정상 로그인 → 200, 토큰 발급', async () => {
      await signupWithOtp(app, testPhone, {
        name: '이이보',
        birthDate: '1995-05-05',
      });
      const res = await loginWithOtp(app, testPhone);
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.expiresIn).toBe(900);
    });

    it('login 응답에 User 필드 포함 (FastAPI 호환)', async () => {
      await signupWithOtp(app, testPhone, {
        name: '이이보',
        birthDate: '1995-05-05',
      });
      const res = await loginWithOtp(app, testPhone);
      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.phoneNumber).toBe(testPhone);
      expect(res.body.name).toBe('이이보');
      expect(res.body.birthDate).toBe('1995-05-05');
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.accessToken).toBeDefined();
    });

    it('login - 하이픈 포함 전화번호 정규화', async () => {
      await signupWithOtp(app, testPhone, {
        name: '이이보',
        birthDate: '1995-05-05',
      });
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phoneNumber: '010-7777-7777', purpose: 'login' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phoneNumber: '010-7777-7777', purpose: 'login', code: '123456' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: '010-7777-7777' })
        .expect(200);
      expect(res.body.phoneNumber).toBe(testPhone);
    });

    it('미가입 전화번호 → 404', async () => {
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phoneNumber: '01000000000', purpose: 'login' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phoneNumber: '01000000000', purpose: 'login', code: '123456' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: '01000000000' })
        .expect(404);
    });

    it('에러 응답에 detail 필드 포함 (FastAPI 호환)', async () => {
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phoneNumber: '01000000000', purpose: 'login' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phoneNumber: '01000000000', purpose: 'login', code: '123456' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: '01000000000' })
        .expect(404);
      expect(res.body.detail).toBeDefined();
      expect(typeof res.body.detail).toBe('string');
    });
  });

  describe('인증 필요 API', () => {
    let accessToken: string;

    beforeEach(async () => {
      const signupRes = await signupWithOtp(app, testPhone, {
        name: '이이보',
        birthDate: '1995-05-05',
      });
      expect(signupRes.status).toBe(201);
      accessToken = signupRes.body.accessToken;
    });

    it('GET /auth/me - 토큰 있으면 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.phoneNumber).toBe(testPhone);
      expect(res.body.accessToken).toBeUndefined();
    });

    it('GET /auth/me - 토큰 없으면 401', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('GET /auth/me - 잘못된 토큰 → 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalidtoken')
        .expect(401);
    });

    it('POST /auth/logout - 토큰 있으면 204', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('POST /auth/logout - 토큰 없으면 401', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });
  });

  describe('PATCH /auth/me (N28)', () => {
    let accessToken: string;

    beforeEach(async () => {
      const signupRes = await signupWithOtp(app, testPhone, {
        name: '이이보',
        birthDate: '1995-05-05',
        gender: 'male',
      });
      expect(signupRes.status).toBe(201);
      accessToken = signupRes.body.accessToken;
    });

    it('토큰 없으면 401', async () => {
      await request(app.getHttpServer())
        .patch('/auth/me')
        .send({ name: '새이름' })
        .expect(401);
    });

    it('name 수정 → 200, GET /auth/me와 동일 형태', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '새이름' })
        .expect(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('새이름');
      expect(res.body.phoneNumber).toBe(testPhone);
      expect(res.body.accessToken).toBeUndefined();

      // GET /auth/me와 정합 — 수정된 값이 그대로 조회된다.
      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body.name).toBe('새이름');
      expect(me.body.id).toBe(res.body.id);
    });

    it('gender 수정 → 200, null 보내면 미선택으로 초기화', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ gender: 'female' })
        .expect(200);
      expect(res.body.gender).toBe('female');

      const cleared = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ gender: null })
        .expect(200);
      expect(cleared.body.gender).toBeNull();
    });

    it('잘못된 gender → 400', async () => {
      await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ gender: 'other' })
        .expect(400);
    });

    it('빈 본문(수정 필드 없음) → 400', async () => {
      await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });

    it('허용되지 않은 필드(phoneNumber) → 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phoneNumber: '01000000000' })
        .expect(400);
    });

    it('이름 21자 → 400', async () => {
      await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '가'.repeat(21) })
        .expect(400);
    });
  });

  describe('POST /auth/social (N33)', () => {
    const socialToken = 'e2e-social-token-abc123';

    afterAll(async () => {
      // 소셜 계정(phoneNumber null)은 suite 공통 cleanup 대상이 아니므로 직접 정리한다.
      const ids = await prisma.socialAccount
        .findMany({
          where: { provider: { in: ['kakao', 'google', 'apple'] } },
          select: { userId: true },
        })
        .catch(() => [] as Array<{ userId: number }>);
      const userIds = ids.map((s) => s.userId);
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    });

    it('미가입 소셜 → 계정 생성 + isNewUser=true + 토큰 발급 (phone/birthDate null)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/social')
        .send({ provider: 'kakao', accessToken: socialToken })
        .expect(200);

      expect(res.body.isNewUser).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(res.body.phoneNumber).toBeNull();
      expect(res.body.birthDate).toBeNull();
      expect(res.body.name).toBe('카카오 테스트 회원');
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.expiresIn).toBe(900);
    });

    it('기존 소셜 계정 → isNewUser=false, 같은 사용자로 로그인 (기존 refresh 세션)', async () => {
      const first = await request(app.getHttpServer())
        .post('/auth/social')
        .send({ provider: 'kakao', accessToken: socialToken })
        .expect(200);

      const second = await request(app.getHttpServer())
        .post('/auth/social')
        .send({ provider: 'kakao', accessToken: socialToken })
        .expect(200);

      expect(second.body.isNewUser).toBe(false);
      expect(second.body.id).toBe(first.body.id);

      // 발급된 access token으로 GET /auth/me가 동작한다 (세션 정상).
      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${second.body.accessToken}`)
        .expect(200);
      expect(me.body.id).toBe(first.body.id);
      expect(me.body.phoneNumber).toBeNull();

      // 같은 토큰 문자열이어도 제공자가 다르면 다른 계정으로 분리된다.
      const google = await request(app.getHttpServer())
        .post('/auth/social')
        .send({ provider: 'google', accessToken: socialToken })
        .expect(200);
      expect(google.body.isNewUser).toBe(true);
      expect(google.body.id).not.toBe(first.body.id);
    });

    it('지원하지 않는 provider → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/social')
        .send({ provider: 'naver', accessToken: socialToken })
        .expect(400);
      expect(res.body.detail).toBeDefined();
    });

    it('빈 토큰 → 401 (mock 검증 실패 매핑)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/social')
        .send({ provider: 'kakao', accessToken: '' })
        .expect(401);
      expect(res.body.detail).toBeDefined();
    });

    it('link-phone: OTP(social_link) 본인확인 후 전화번호·생년월일 연결', async () => {
      const social = await request(app.getHttpServer())
        .post('/auth/social')
        .send({ provider: 'kakao', accessToken: `${socialToken}-link` })
        .expect(200);
      const accessToken = social.body.accessToken;

      // OTP 본인확인 없이 연결 시도 → 401
      await request(app.getHttpServer())
        .post('/auth/social/link-phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phoneNumber: testPhone })
        .expect(401);

      // OTP(social_link) 발송·검증 후 연결 성공
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phoneNumber: testPhone, purpose: 'social_link' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phoneNumber: testPhone, purpose: 'social_link', code: '123456' })
        .expect(200);

      const linked = await request(app.getHttpServer())
        .post('/auth/social/link-phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phoneNumber: testPhone, birthDate: '1998-03-03' })
        .expect(200);
      expect(linked.body.phoneNumber).toBe(testPhone);
      expect(linked.body.birthDate).toBe('1998-03-03');

      // GET /auth/me와 정합
      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body.phoneNumber).toBe(testPhone);
    });

    it('link-phone: 이미 다른 계정이 쓴 번호는 409', async () => {
      // 전화 가입 계정 생성 (01044444444 — allowlist)
      await signupWithOtp(app, '01044444444', {
        name: '전화회원',
        birthDate: '1990-01-01',
      });

      const social = await request(app.getHttpServer())
        .post('/auth/social')
        .send({ provider: 'apple', accessToken: `${socialToken}-conflict` })
        .expect(200);
      const accessToken = social.body.accessToken;

      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phoneNumber: '01044444444', purpose: 'social_link' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phoneNumber: '01044444444', purpose: 'social_link', code: '123456' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/auth/social/link-phone')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phoneNumber: '01044444444' })
        .expect(409);
      expect(res.body.detail).toContain('이미 가입된');

      // 정리: 전화 회원 삭제
      await prisma.user.deleteMany({ where: { phoneNumber: '01044444444' } });
    });
  });

  describe('POST /auth/refresh', () => {
    it('유효한 refresh token → 200, 새 토큰', async () => {
      await signupWithOtp(app, testPhone, {
        name: '이이보',
        birthDate: '1995-05-05',
      });
      const loginRes = await loginWithOtp(app, testPhone);
      expect(loginRes.status).toBe(200);

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(loginRes.body.refreshToken);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(401);
    });

    it('잘못된 refresh token → 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid' })
        .expect(401);
    });
  });

  describe('OTP 미검증 시 가입/로그인 거부 (N2)', () => {
    it('OTP 검증 없이 signup → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
        })
        .expect(401);
      expect(res.body.detail).toContain('본인확인');
    });

    it('OTP 검증 없이 login → 401', async () => {
      await signupWithOtp(app, testPhone, {
        name: '이이보',
        birthDate: '1995-05-05',
      });
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: testPhone })
        .expect(401);
      expect(res.body.detail).toContain('본인확인');
    });
  });
});
