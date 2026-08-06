import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * N2: ADMIN 운영 API 권한 e2e 테스트.
 *
 * 검증 대상:
 * 1. 미인증 → 401
 * 2. USER → 403
 * 3. ADMIN → 200
 * 4. 역할 변경 + 감사 로그 기록
 *
 * OTP 흐름(allowlist 고정 OTP)으로 가입 후 Prisma로 role 승격해 ADMIN 토큰 획득.
 * ADMIN describe는 상위 beforeEach 없이 단일 beforeAll로 setup한다.
 */
describe('Admin API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
  let targetUserId: number;

  const adminPhone = '01033333333';
  const userPhone = '01044444444';
  const targetPhone = '01055555555';
  const phones = [adminPhone, userPhone, targetPhone];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://todayskin:secret@localhost:5432/todayskin_test';
    process.env.JWT_ACCESS_SECRET = 'e2e_access_secret_at_least_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'e2e_refresh_secret_at_least_32_characters_long';
    process.env.ALLOWED_ORIGINS = '';
    process.env.OTP_ALLOWLIST_PHONES = phones.join(',');

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

    // 정리 후 setup 수행.
    await prisma.auditLog.deleteMany({});
    await prisma.refreshSession.deleteMany({});
    await prisma.otpCode.deleteMany({ where: { phoneNumber: { in: phones } } });
    await prisma.user.deleteMany({ where: { phoneNumber: { in: phones } } });

    // ADMIN: 가입 → role 승격 → 로그인.
    await request(app.getHttpServer()).post('/otp/send').send({ phoneNumber: adminPhone, purpose: 'signup' }).expect(200);
    await request(app.getHttpServer()).post('/otp/verify').send({ phoneNumber: adminPhone, purpose: 'signup', code: '123456' }).expect(200);
    const adminSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ phoneNumber: adminPhone, name: '관리자', birthDate: '1990-01-01' })
      .expect(201);
    await prisma.user.update({
      where: { id: adminSignup.body.id },
      data: { role: 'ADMIN' },
    });
    await request(app.getHttpServer()).post('/otp/send').send({ phoneNumber: adminPhone, purpose: 'login' }).expect(200);
    await request(app.getHttpServer()).post('/otp/verify').send({ phoneNumber: adminPhone, purpose: 'login', code: '123456' }).expect(200);
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phoneNumber: adminPhone })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    // 일반 USER.
    await request(app.getHttpServer()).post('/otp/send').send({ phoneNumber: userPhone, purpose: 'signup' }).expect(200);
    await request(app.getHttpServer()).post('/otp/verify').send({ phoneNumber: userPhone, purpose: 'signup', code: '123456' }).expect(200);
    const userSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ phoneNumber: userPhone, name: '일반유저', birthDate: '1990-01-01' })
      .expect(201);
    userToken = userSignup.body.accessToken;

    // 역할 변경 대상 USER.
    await request(app.getHttpServer()).post('/otp/send').send({ phoneNumber: targetPhone, purpose: 'signup' }).expect(200);
    await request(app.getHttpServer()).post('/otp/verify').send({ phoneNumber: targetPhone, purpose: 'signup', code: '123456' }).expect(200);
    const targetSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ phoneNumber: targetPhone, name: '대상유저', birthDate: '1990-01-01' })
      .expect(201);
    targetUserId = targetSignup.body.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({});
    await prisma.refreshSession.deleteMany({});
    await prisma.otpCode.deleteMany({ where: { phoneNumber: { in: phones } } });
    await prisma.user.deleteMany({ where: { phoneNumber: { in: phones } } });
    await app.close();
  });

  it('미인증 GET /admin/users → 401', async () => {
    await request(app.getHttpServer()).get('/admin/users').expect(401);
  });

  it('USER GET /admin/users → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    expect(res.body.detail).toContain('권한');
  });

  it('ADMIN GET /admin/users → 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.users).toBeDefined();
    expect(res.body.total).toBeGreaterThanOrEqual(3);
  });

  it('USER POST /admin/users/role → 403', async () => {
    await request(app.getHttpServer())
      .post('/admin/users/role')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userId: targetUserId, role: 'ADMIN' })
      .expect(403);
  });

  it('ADMIN POST /admin/users/role → 200 + 감사 로그', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/users/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: targetUserId, role: 'ADMIN' })
      .expect(200);
    expect(res.body.role).toBe('ADMIN');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'user_role_changed', targetId: String(targetUserId) },
    });
    expect(audit).not.toBeNull();
    expect(audit?.result).toBe('success');
  });

  it('ADMIN 동일 역할 변경 → 400', async () => {
    await request(app.getHttpServer())
      .post('/admin/users/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: targetUserId, role: 'ADMIN' })
      .expect(400);
  });

  it('ADMIN 자기 자신 역할 변경 → 400', async () => {
    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/admin/users/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: meRes.body.id, role: 'USER' })
      .expect(400);
  });
});
