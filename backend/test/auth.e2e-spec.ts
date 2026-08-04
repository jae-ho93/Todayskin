import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Auth e2e 테스트.
 * 실제 test DB(todayskin_test)를 사용한다.
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
    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.refreshSession.deleteMany({});
    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });
  });

  describe('POST /auth/signup', () => {
    it('정상 가입 → 201, accessToken 포함', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.phoneNumber).toBe(testPhone);
      expect(res.body.name).toBe('이이보');
      expect(res.body.accessToken).toBeDefined();
      // signup도 login과 동일하게 refresh token을 발급한다
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.expiresIn).toBe(900);
    });

    it('중복 전화번호 → 409', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
        })
        .expect(409)
        .then((res) => {
          // 에러 응답에 detail 필드 포함 (FastAPI 호환)
          expect(res.body.detail).toContain('이미 가입된');
        });
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

      // class-validator 메시지가 detail로 노출되는지 확인
      expect(res.body.detail).toBeDefined();
    });

    it('gender 선택 필드 포함', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
          gender: 'female',
        })
        .expect(201);

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
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: testPhone })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.expiresIn).toBe(900);
    });

    it('login 응답에 User 필드 포함 (FastAPI 호환)', async () => {
      // 프론트(src/api/client.ts)는 login 응답 전체를 User 세션으로 저장한다.
      // id/phoneNumber/name/birthDate/gender/createdAt이 모두 있어야 한다.
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: testPhone })
        .expect(200);

      expect(res.body.id).toBeDefined();
      expect(res.body.phoneNumber).toBe(testPhone);
      expect(res.body.name).toBe('이이보');
      expect(res.body.birthDate).toBe('1995-05-05');
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.accessToken).toBeDefined();
    });

    it('login - 하이픈 포함 전화번호 정규화', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: '010-7777-7777' })
        .expect(200);

      expect(res.body.phoneNumber).toBe(testPhone);
    });

    it('미가입 전화번호 → 404', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: '01066666666' })
        .expect(404);
    });

    it('에러 응답에 detail 필드 포함 (FastAPI 호환)', async () => {
      // 프론트 extractErrorMessage는 data.detail에서 메시지를 추출한다.
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: '01066666666' })
        .expect(404);

      expect(res.body.detail).toBeDefined();
      expect(typeof res.body.detail).toBe('string');
    });
  });

  describe('인증 필요 API', () => {
    let accessToken: string;

    beforeEach(async () => {
      const signupRes = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
        })
        .expect(201);
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

  describe('POST /auth/refresh', () => {
    it('유효한 refresh token → 200, 새 토큰', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          phoneNumber: testPhone,
          name: '이이보',
          birthDate: '1995-05-05',
        })
        .expect(201);

      // signup은 본문에 accessToken만 있으므로 login으로 refresh token 획득
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: testPhone })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(loginRes.body.refreshToken);

      // 기존 refresh token은 폐기되어 재사용 불가
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
});
