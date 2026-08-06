import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * N2: OTP 발송/검증 흐름 e2e 테스트.
 *
 * 검증 대상:
 * 1. OTP 발송/검증 (allowlist 고정 OTP).
 * 2. OTP 코드 불일치, 미발송, 재전송 제한.
 * 3. OTP 미검증 시 가입/로그인 거부 (401).
 *
 * ADMIN API 권한 테스트는 admin-api.e2e-spec.ts에서 별도 수행.
 */
describe('OTP (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const phone = '01011111111';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://todayskin:secret@localhost:5432/todayskin_test';
    process.env.JWT_ACCESS_SECRET = 'e2e_access_secret_at_least_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'e2e_refresh_secret_at_least_32_characters_long';
    process.env.ALLOWED_ORIGINS = '';
    process.env.OTP_ALLOWLIST_PHONES = '01011111111,01022222222,01000000000';
    process.env.OTP_RESEND_COOLDOWN_SECONDS = '1';

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
    await prisma.otpCode.deleteMany({ where: { phoneNumber: { in: [phone, '01022222222', '01000000000'] } } });
    await prisma.refreshSession.deleteMany({});
    await prisma.user.deleteMany({
      where: { phoneNumber: { in: [phone, '01022222222', '01000000000'] } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.otpCode.deleteMany({});
    await prisma.refreshSession.deleteMany({});
    await prisma.user.deleteMany({
      where: { phoneNumber: { in: [phone, '01022222222', '01000000000'] } },
    });
  });

  it('POST /otp/send → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/otp/send')
      .send({ phoneNumber: phone, purpose: 'signup' })
      .expect(200);
    expect(res.body.message).toContain('발송');
  });

  it('잘못된 전화번호 → 400', async () => {
    await request(app.getHttpServer())
      .post('/otp/send')
      .send({ phoneNumber: '02-123-4567', purpose: 'signup' })
      .expect(400);
  });

  it('잘못된 purpose → 400', async () => {
    await request(app.getHttpServer())
      .post('/otp/send')
      .send({ phoneNumber: phone, purpose: 'invalid' })
      .expect(400);
  });

  it('OTP 검증 성공 → 200', async () => {
    await request(app.getHttpServer())
      .post('/otp/send')
      .send({ phoneNumber: phone, purpose: 'signup' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post('/otp/verify')
      .send({ phoneNumber: phone, purpose: 'signup', code: '123456' })
      .expect(200);
    expect(res.body.message).toContain('완료');
  });

  it('OTP 코드 불일치 → 401', async () => {
    await request(app.getHttpServer())
      .post('/otp/send')
      .send({ phoneNumber: phone, purpose: 'signup' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post('/otp/verify')
      .send({ phoneNumber: phone, purpose: 'signup', code: '000000' })
      .expect(401);
    expect(res.body.detail).toContain('일치하지 않');
  });

  it('OTP 발송 없이 검증 → 401', async () => {
    await request(app.getHttpServer())
      .post('/otp/verify')
      .send({ phoneNumber: phone, purpose: 'signup', code: '123456' })
      .expect(401);
  });

  it('재전송 대기 시간 내 재전송 → 429', async () => {
    await request(app.getHttpServer())
      .post('/otp/send')
      .send({ phoneNumber: phone, purpose: 'signup' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post('/otp/send')
      .send({ phoneNumber: phone, purpose: 'signup' })
      .expect(429);
    expect(res.body.detail).toContain('재전송');
  });

  it('OTP 검증 없이 signup → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ phoneNumber: phone, name: '테스터', birthDate: '1990-01-01' })
      .expect(401);
    expect(res.body.detail).toContain('본인확인');
  });

  it('OTP 검증 없이 login → 401', async () => {
    // 먼저 가입(OTP 흐름 포함)
    await request(app.getHttpServer()).post('/otp/send').send({ phoneNumber: phone, purpose: 'signup' }).expect(200);
    await request(app.getHttpServer()).post('/otp/verify').send({ phoneNumber: phone, purpose: 'signup', code: '123456' }).expect(200);
    await request(app.getHttpServer()).post('/auth/signup').send({ phoneNumber: phone, name: '테스터', birthDate: '1990-01-01' }).expect(201);
    // OTP 없이 login → 401
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phoneNumber: phone })
      .expect(401);
    expect(res.body.detail).toContain('본인확인');
  });
});
