import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { KmaClient } from '../src/modules/weather/clients/kma.client';
import { AirKoreaClient } from '../src/modules/weather/clients/airkorea.client';
import { StationClient } from '../src/modules/weather/clients/station.client';
import { RedisService } from '../src/redis/redis.service';
import { signupWithOtp } from './helpers/auth-flow';

/**
 * 진단 파일 검증 + 개인 패턴 locked/ready e2e (T13).
 *
 * 검증 대상:
 * 1. 진단 제출 multipart — 필드 누락, MIME, 빈 파일 거부.
 * 2. GET /diagnosis/pattern — 데이터 부족 시 200 + LOCKED (404 아님).
 * 3. 진단 이력/최신 조회 소유권 (타 사용자 접근 불가 구조).
 *
 * 외부 API는 mock, InferenceProvider는 MockInferenceProvider(MOCK_INFERENCE=true) 사용.
 */
describe('Diagnosis & Pattern (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: number;

  const testPhone = '01088888888';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://todayskin:secret@localhost:5432/todayskin_test';
    process.env.JWT_ACCESS_SECRET = 'e2e_access_secret_at_least_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'e2e_refresh_secret_at_least_32_characters_long';
    process.env.ALLOWED_ORIGINS = '';
    process.env.MOCK_GEMINI = 'true';
    process.env.MOCK_INFERENCE = 'true';
    // N2: OTP allowlist로 고정 OTP(123456) 사용.
    process.env.OTP_ALLOWLIST_PHONES = '01088888888';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KmaClient)
      .useValue({ fetchUvIndex: jest.fn().mockResolvedValue({ current: null, peak: null, peakHour: null, observedAt: null }) })
      .overrideProvider(AirKoreaClient)
      .useValue({ fetchAirQuality: jest.fn().mockResolvedValue({ ozone: null, pm25: null, pm10: null, cai: null, no2: null, so2: null, co: null, observedAt: null }) })
      .overrideProvider(StationClient)
      .useValue({ fetchNearestStation: jest.fn().mockResolvedValue(null) })
      .overrideProvider(RedisService)
      .useValue({
        isAvailable: jest.fn().mockReturnValue(false),
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(true),
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

    const signupRes = await signupWithOtp(app, testPhone, {
      name: '진단테스터',
      birthDate: '1990-01-01',
    });
    expect(signupRes.status).toBe(201);
    accessToken = signupRes.body.accessToken;
    userId = signupRes.body.id;
  });

  afterAll(async () => {
    // 진단을 먼저 삭제해 weatherSnapshot 참조를 끊은 뒤 스냅샷 정리.
    await prisma.skinMetric.deleteMany({ where: { diagnosis: { userId } } });
    await prisma.diagnosis.deleteMany({ where: { userId } });
    // 이 테스트에서 생성한 weatherSnapshot을 명시적으로 정리 (regionName=서울).
    await prisma.weatherSnapshot.deleteMany({ where: { regionName: '서울' } });
    await prisma.recommendation.deleteMany({ where: { userId } });
    await prisma.otpCode.deleteMany({ where: { phoneNumber: testPhone } });
    await prisma.refreshSession.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });
    await app.close();
  });

  // JPEG 1x1 픽셀 버퍼 (최소 valid JPEG)
  const JPEG_1x1 = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrq6tba2t7i5usLFxsfIycrO0NHS09TV1tfY2drq6+vsLTz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhCRJFiGQYHR8VjQoLxaKyEjOTFS8pHj4xQlRJU1VWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqLjI2Oj5KSk5SVlpeYmZqYm5ydXp6cnqcoqSlpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drq6+vr/9sAQwA',
    'base64',
  );
  describe('진단 multipart 파일 검증', () => {
    it('필드 누락(front 없음) → 400', async () => {
      await request(app.getHttpServer())
        .post('/diagnosis')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('빈 파일 → 400', async () => {
      await request(app.getHttpServer())
        .post('/diagnosis')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('front', Buffer.alloc(0), 'front.jpg')
        .expect(400);
    });

    it('지원하지 않는 MIME (text/plain) → 400', async () => {
      await request(app.getHttpServer())
        .post('/diagnosis')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('front', Buffer.from('notimage'), { filename: 'front.txt', contentType: 'text/plain' })
        .expect(400);
    });

    it('정상 제출 → 201 (MockInferenceProvider 고정값)', async () => {
      // 중복 요청 방지(60초) 회피를 위해 이전 진단이 없도록 정리는 afterAll에서.
      // 첫 제출은 정상 201이어야 한다.
      const res = await request(app.getHttpServer())
        .post('/diagnosis')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('front', JPEG_1x1, 'front.jpg')
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.overallScore).toBeDefined();
      expect(res.body.parts).toHaveLength(6);
    });

    it('동일 사용자 60초 이내 중복 제출 → 400', async () => {
      await request(app.getHttpServer())
        .post('/diagnosis')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('front', JPEG_1x1, 'front.jpg')
        .expect(400);
    });

    it('인증 없이 진단 제출 → 401', async () => {
      await request(app.getHttpServer())
        .post('/diagnosis')
        .attach('front', JPEG_1x1, 'front.jpg')
        .expect(401);
    });
  });

  describe('진단 이력/최신 조회', () => {
    it('GET /diagnosis/latest → 본인 최신 진단', async () => {
      const res = await request(app.getHttpServer())
        .get('/diagnosis/latest')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBeDefined();
      expect(res.body.overallScore).toBeDefined();
      expect(Array.isArray(res.body.parts)).toBe(true);
    });

    it('GET /diagnosis/history → 본인 이력 배열', async () => {
      const res = await request(app.getHttpServer())
        .get('/diagnosis/history')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('개인 패턴 locked/ready', () => {
    it('진단 3개(날씨 연결, 최소 5 미만) → 200 + LOCKED (404 아님)', async () => {
      // 날씨 스냅샷을 직접 생성해 진단에 연결.
      // (외부 API mock이 UNAVAILABLE이므로 진단 제출 시 weatherSnapshotId가 null이 됨.
      //  Pattern은 weatherSnapshot이 있는 진단만 시계열에 포함하므로 직접 연결.)
      const ws = await prisma.weatherSnapshot.create({
        data: {
          observedAt: new Date(),
          regionName: '서울',
          source: 'LIVE',
          uvIndex: 5,
          pm25: 20,
          pm10: 40,
          collectedAt: new Date(),
        },
      });
      for (let i = 0; i < 3; i++) {
        await prisma.diagnosis.create({
          data: {
            id: `diag-pattern-${i}-${Date.now()}`,
            userId,
            capturedAt: new Date(Date.now() - i * 86400000),
            overallScore: 70 + i,
            status: 'COMPLETED',
            modelVersion: 'mock-v0.1.0',
            weatherSnapshotId: ws.id,
          },
        });
      }

      const res = await request(app.getHttpServer())
        .get('/diagnosis/pattern')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.status).toBe('LOCKED');
      expect(res.body.collectedDays).toBeGreaterThan(0);
      expect(res.body.requiredDays).toBe(5);
      expect(res.body.correlations).toEqual([]);
      expect(res.body.recommendationIds).toEqual([]);
      expect(res.body.lockedMessage).toBeDefined();
    });

    it('인증 없이 패턴 조회 → 401', async () => {
      await request(app.getHttpServer()).get('/diagnosis/pattern').expect(401);
    });
  });
});
