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
    // N22: 번호별 일일 발송 한도(allowlist 밖 번호만 적용) — 테스트용으로 작게 설정.
    process.env.OTP_DAILY_LIMIT_PER_PHONE = '3';

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
    await prisma.otpCode.deleteMany({
      where: { phoneNumber: { in: [phone, '01022222222', '01000000000', '01099999999'] } },
    });
    // N22: 일일 한도 집계용 발송 로그도 정리 — 재실행 간 누적 방지.
    await prisma.otpSendLog.deleteMany({
      where: { phoneNumber: { in: [phone, '01022222222', '01000000000', '01099999999'] } },
    });
    await prisma.refreshSession.deleteMany({});
    await prisma.user.deleteMany({
      where: { phoneNumber: { in: [phone, '01022222222', '01000000000', '01099999999'] } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.otpCode.deleteMany({});
    await prisma.otpSendLog.deleteMany({});
    await prisma.refreshSession.deleteMany({});
    await prisma.user.deleteMany({
      where: { phoneNumber: { in: [phone, '01022222222', '01000000000'] } },
    });
  });

  it('POST /otp/send → 200 (MO: code + recipientNumber 반환)', async () => {
    const res = await request(app.getHttpServer())
      .post('/otp/send')
      .send({ phoneNumber: phone, purpose: 'signup' })
      .expect(200);
    expect(res.body.message).toContain('발송');
    // MO(Mobile Originated): 서비스가 문자를 발송하지 않으므로
    // 화면 표시용 인증코드와 수신 번호가 응답에 포함된다 (프론트 안내용).
    expect(res.body.code).toBe('123456'); // allowlisted 고정 OTP
    expect(res.body.recipientNumber).toBeDefined();
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

  it('N22: 번호별 일일 발송 한도 초과 시 429 (allowlisted 번호는 예외)', async () => {
    const spamPhone = '01099999999'; // allowlist 밖 — 한도 3회 적용
    // 재전송 쿨다운(1초)과 겹치지 않도록 발송 사이 대기한다.
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // 한도(3회)까지는 성공.
    for (let i = 0; i < 3; i++) {
      if (i > 0) await sleep(1100);
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phoneNumber: spamPhone, purpose: 'signup' })
        .expect(200);
    }

    // 4회째는 일일 한도 429 — IP가 바뀌어도 번호 기준으로 막힌다.
    // (쿨다운을 넘겨 일일 한도 응답임을 확인한다)
    await sleep(1100);
    const res = await request(app.getHttpServer())
      .post('/otp/send')
      .send({ phoneNumber: spamPhone, purpose: 'signup' })
      .expect(429);
    expect(res.body.detail).toContain('초과');

    // allowlisted 개발 번호는 글로벌 제한에서 예외 — 계속 발송 가능.
    await request(app.getHttpServer())
      .post('/otp/send')
      .send({ phoneNumber: phone, purpose: 'signup' })
      .expect(200);
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
