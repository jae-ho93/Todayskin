import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { GeminiClient } from '../src/modules/gemini/gemini.client';
import { signupWithOtp } from './helpers/auth-flow';
import { grantRecommendationTransfer } from './helpers/consent-flow';
import { JobStatus } from '../src/modules/jobs/enums/job-status.enum';

/**
 * N4: 비동기 job enqueue + polling e2e.
 * Inline dispatcher(NODE_ENV=test)로 PENDING → COMPLETED/FAILED 계약을 검증한다.
 */
describe('Jobs async (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: number;
  const testPhone = '01077777777';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://todayskin:secret@localhost:5432/todayskin_test';
    process.env.JWT_ACCESS_SECRET = 'e2e_access_secret_at_least_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'e2e_refresh_secret_at_least_32_characters_long';
    process.env.ALLOWED_ORIGINS = '';
    process.env.OTP_ALLOWLIST_PHONES = `${testPhone},01088888888`;
    process.env.OTP_MAX_PENDING_PER_PHONE = '50';
    process.env.JOB_DISPATCHER = 'inline';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GeminiClient)
      .useValue({
        generateRecommendations: jest.fn().mockResolvedValue([
          {
            title: '이중 세안 권장',
            explanation: '오늘 환경에 맞춘 관리가 도움될 수 있어요.',
            ingredientTags: ['세라마이드'],
            timing: '외출 후',
          },
        ]),
        generateWeatherProducts: jest.fn().mockResolvedValue([]),
      })
      .compile();

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

    // 이전 테스트 실행 잔여 데이터 정리.
    await prisma.asyncJob.deleteMany({ where: { user: { phoneNumber: { in: [testPhone, '01088888888'] } } } }).catch(() => undefined);
    await prisma.recommendation.deleteMany({ where: { user: { phoneNumber: { in: [testPhone, '01088888888'] } } } }).catch(() => undefined);
    await prisma.consentRecord.deleteMany({ where: { user: { phoneNumber: { in: [testPhone, '01088888888'] } } } }).catch(() => undefined);
    await prisma.otpCode.deleteMany({ where: { phoneNumber: { in: [testPhone, '01088888888'] } } }).catch(() => undefined);
    await prisma.refreshSession.deleteMany({ where: { user: { phoneNumber: { in: [testPhone, '01088888888'] } } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { phoneNumber: { in: [testPhone, '01088888888'] } } }).catch(() => undefined);

    const signupRes = await signupWithOtp(app, testPhone, {
      name: '잡테스터',
      birthDate: '2000-01-01',
    });
    accessToken = signupRes.body.accessToken;
    userId = signupRes.body.id;
    await grantRecommendationTransfer(app, accessToken);
  });

  afterAll(async () => {
    await prisma.asyncJob.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.recommendation.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.consentRecord.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.otpCode.deleteMany({ where: { phoneNumber: { in: [testPhone, '01088888888'] } } }).catch(() => undefined);
    await prisma.refreshSession.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { phoneNumber: { in: [testPhone, '01088888888'] } } }).catch(() => undefined);
    await app.close();
  });

  async function waitForJob(
    jobId: string,
    timeoutMs = 5000,
  ): Promise<{ status: string; result?: unknown; error?: string | null }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await request(app.getHttpServer())
        .get(`/jobs/${jobId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      if (res.body.status !== JobStatus.PENDING) {
        return res.body;
      }
      const { promise: sleepP, resolve: sleepR } = Promise.withResolvers<void>();
      setTimeout(sleepR, 50);
      await sleepP;
    }
    throw new Error(`job ${jobId} did not finish within ${timeoutMs}ms`);
  }

  describe('POST /recommendations/generate/async', () => {
    it('인증 없이 401', async () => {
      await request(app.getHttpServer())
        .post('/recommendations/generate/async')
        .send({ skinScore: {}, weather: {} })
        .expect(401);
    });

    it('즉시 jobId(PENDING) 반환 후 polling으로 COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .post('/recommendations/generate/async')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ skinScore: { overallScore: 70 }, weather: {} })
        .expect(202);

      expect(res.body.jobId).toBeDefined();
      expect(res.body.status).toBe(JobStatus.PENDING);

      const final = await waitForJob(res.body.jobId);
      expect(final.status).toBe(JobStatus.COMPLETED);
      const result = final.result;
      expect(
        result && typeof result === 'object' && 'recommendations' in result,
      ).toBe(true);
    });
  });

  describe('POST /diagnosis/pattern/async', () => {
    it('즉시 jobId 반환 후 COMPLETED 또는 LOCKED 결과', async () => {
      const res = await request(app.getHttpServer())
        .post('/diagnosis/pattern/async')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(202);

      expect(res.body.jobId).toBeDefined();
      const final = await waitForJob(res.body.jobId);
      expect([JobStatus.COMPLETED, JobStatus.FAILED]).toContain(final.status);
    });
  });

  describe('POST /notifications/send/async', () => {
    it('pushEnabled=false면 skipped=true로 COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .post('/notifications/send/async')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ kind: 'uv' })
        .expect(202);

      const final = await waitForJob(res.body.jobId);
      expect(final.status).toBe(JobStatus.COMPLETED);
      const result = final.result;
      if (
        !(
          result &&
          typeof result === 'object' &&
          'notification' in result
        )
      ) {
        throw new Error('notification result missing');
      }
      const notif = (result as { notification: { skipped: boolean } }).notification;
      expect(notif).toBeDefined();
      expect(notif.skipped).toBe(true);
    });

    it('pushEnabled=true 후 uv 발송 시 delivered=true', async () => {
      await request(app.getHttpServer())
        .put('/notifications/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ pushEnabled: true, uvAlertEnabled: true })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/notifications/send/async')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ kind: 'uv', title: '테스트', body: '본문' })
        .expect(202);

      const final = await waitForJob(res.body.jobId);
      expect(final.status).toBe(JobStatus.COMPLETED);
      const result = final.result;
      if (
        !(
          result &&
          typeof result === 'object' &&
          'notification' in result
        )
      ) {
        throw new Error('notification result missing');
      }
      const notif = (result as { notification: { delivered: boolean } }).notification;
      expect(notif.delivered).toBe(true);
    });
  });

  describe('GET /jobs/:id 소유권', () => {
    it('타 사용자 job 조회 시 403', async () => {
      // 다른 사용자 가입
      const otherPhone = '01088888888';
      const otherSignup = await signupWithOtp(app, otherPhone, {
        name: '다른잡',
        birthDate: '1990-01-01',
      });
      const otherToken = otherSignup.body.accessToken;
      const otherUserId = otherSignup.body.id;

      // 첫 사용자 job 생성
      const enqueue = await request(app.getHttpServer())
        .post('/notifications/send/async')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ kind: 'generic' })
        .expect(202);
      const jobId = enqueue.body.jobId;

      // 타 사용자 조회 → 403
      await request(app.getHttpServer())
        .get(`/jobs/${jobId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      // 정리
      await prisma.asyncJob.deleteMany({ where: { userId: otherUserId } }).catch(() => undefined);
      await prisma.otpCode.deleteMany({ where: { phoneNumber: otherPhone } }).catch(() => undefined);
      await prisma.refreshSession.deleteMany({ where: { userId: otherUserId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { phoneNumber: otherPhone } }).catch(() => undefined);
    });

    it('존재하지 않는 job 404', async () => {
      await request(app.getHttpServer())
        .get('/jobs/no-such-job')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});