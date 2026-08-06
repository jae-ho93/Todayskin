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
import { signupWithOtp, loginWithOtp } from './helpers/auth-flow';

/**
 * 프론트 API response contract 통합 테스트 (T13).
 *
 * 검증 대상:
 * 1. 날씨 지표가 정부 API 실패 시 null(측정 불가)이고 source=UNAVAILABLE.
 * 2. 추천 생성 API가 Gemini 실패 시 503 (가짜 데이터 폴백 금지).
 * 3. 핵심 API 응답 스키마가 프론트 계약(camelCase, detail 필드)을 유지.
 * 4. 인증 필요 API가 토큰 없이 401.
 *
 * 외부 API(KMA/AirKorea/Station/Redis)는 mock으로 대체한다.
 */
describe('API Response Contract (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let kmaClient: { fetchUvIndex: jest.Mock };
  let airKoreaClient: { fetchAirQuality: jest.Mock };

  const testPhone = '01044444444';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://todayskin:secret@localhost:5432/todayskin_test';
    process.env.JWT_ACCESS_SECRET = 'e2e_access_secret_at_least_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'e2e_refresh_secret_at_least_32_characters_long';
    process.env.ALLOWED_ORIGINS = '';
    // 다른 e2e suite가 같은 Jest worker에서 먼저 실행될 수 있으므로
    // 환경변수를 명시적으로 초기화한다. 테스트 순서에 의존하면
    // recommendation-product의 MOCK_GEMINI=true가 이 suite로 누수된다.
    process.env.MOCK_GEMINI = 'false';
    delete process.env.GEMINI_API_KEY;
    // N2: OTP allowlist로 고정 OTP(123456) 사용.
    process.env.OTP_ALLOWLIST_PHONES = '01044444444,01000000001';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KmaClient)
      .useValue({ fetchUvIndex: jest.fn() })
      .overrideProvider(AirKoreaClient)
      .useValue({ fetchAirQuality: jest.fn() })
      .overrideProvider(StationClient)
      .useValue({ fetchNearestStation: jest.fn() })
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
    kmaClient = app.get(KmaClient);
    airKoreaClient = app.get(AirKoreaClient);
    await app.init();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.recommendation.deleteMany({ where: { user: { phoneNumber: testPhone } } });
    await prisma.refreshSession.deleteMany({
      where: { user: { phoneNumber: testPhone } },
    });
    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });
    await app.close();
    delete process.env.MOCK_GEMINI;
    delete process.env.GEMINI_API_KEY;
  });

  describe('날씨 지표 undefined (측정 불가) 계약', () => {
    it('정부 API 전체 실패 시 모든 지표 null + source=UNAVAILABLE', async () => {
      kmaClient.fetchUvIndex.mockResolvedValue({
        current: null,
        peak: null,
        peakHour: null,
        observedAt: null,
      });
      airKoreaClient.fetchAirQuality.mockResolvedValue({
        ozone: null,
        pm25: null,
        pm10: null,
        cai: null,
        no2: null,
        so2: null,
        co: null,
        observedAt: null,
      });

      const res = await request(app.getHttpServer()).get('/weather').expect(200);

      expect(res.body.source).toBe('UNAVAILABLE');
      expect(res.body.uvIndex).toBeNull();
      expect(res.body.uvStatus).toBeNull();
      expect(res.body.pm25).toBeNull();
      expect(res.body.pm10).toBeNull();
      expect(res.body.caiValue).toBeNull();
      expect(res.body.ozonePpm).toBeNull();
      // UNAVAILABLE 시 observedAt은 현재 서버 시각으로 채워진다 (응답 스키마 유지)
      expect(res.body.observedAt).toBeDefined();
      // regionName은 항상 존재 (기본 지역)
      expect(res.body.regionName).toBeDefined();
    });

    it('UV만 있고 대기질 전체 실패 시 UV는 값, 대기질은 null', async () => {
      kmaClient.fetchUvIndex.mockResolvedValue({
        current: 7,
        peak: 9,
        peakHour: 13,
        observedAt: new Date('2026-08-04T06:00:00Z'),
      });
      airKoreaClient.fetchAirQuality.mockResolvedValue({
        ozone: null,
        pm25: null,
        pm10: null,
        cai: null,
        no2: null,
        so2: null,
        co: null,
        observedAt: null,
      });

      const res = await request(app.getHttpServer()).get('/weather').expect(200);

      expect(res.body.source).toBe('LIVE');
      expect(res.body.uvIndex).toBe(7);
      expect(res.body.uvIndexPeak).toBe(9);
      expect(res.body.uvIndexPeakHour).toBe(13);
      // 대기질은 여전히 null
      expect(res.body.pm25).toBeNull();
      expect(res.body.caiValue).toBeNull();
    });

    it('잘못된 lat 범위 → 400 (ValidationPipe)', async () => {
      await request(app.getHttpServer())
        .get('/weather?lat=999')
        .expect(400);
    });
  });

  describe('추천 생성 503 계약 (Gemini 실패)', () => {
    let accessToken: string;

    beforeAll(async () => {
      const signupRes = await signupWithOtp(app, testPhone, {
        name: '컨트랙트',
        birthDate: '2000-01-01',
      });
      expect(signupRes.status).toBe(201);
      accessToken = signupRes.body.accessToken;
    });

    it('MOCK_GEMINI=false + 키 없음 시 /recommendations/generate → 503', async () => {
      // AppModule 인스턴스는 MOCK_GEMINI 환경변수를 beforeAll에서 읽었으므로
      // 여기서는 별도 app 인스턴스 없이 환경변수 기반 GeminiClient 상태를 검증한다.
      // 이미 이 app은 MOCK_GEMINI 미설정(=false) + 키 없음 상태이므로 503이어야 한다.
      // 단, beforeAll에서 MOCK_GEMINI를 true로 설정하지 않았으므로 기본 false.
      await request(app.getHttpServer())
        .post('/recommendations/generate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ skinScore: { overallScore: 70 }, weather: { uvIndex: 5 } })
        .expect(503)
        .then((res) => {
          // 에러 응답에 detail 필드 포함 (FastAPI 호환)
          expect(res.body.detail).toBeDefined();
        });
    });

    it('POST /products/weather-based — MOCK_GEMINI=false + 키 없음 시 503', async () => {
      await request(app.getHttpServer())
        .post('/products/weather-based')
        .send({ uvIndex: 5, pm25: 20 })
        .expect(503)
        .then((res) => {
          expect(res.body.detail).toBeDefined();
        });
    });
  });

  describe('프론트 응답 스키마 계약', () => {
    it('GET /health 응답에 status, timestamp 포함', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });

    it('에러 응답은 detail 필드 포함 (FastAPI 호환)', async () => {
      // N2: login은 OTP 검증 선행. 미가입 번호라도 OTP 발송은 성공.
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phoneNumber: '01000000001', purpose: 'login' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phoneNumber: '01000000001', purpose: 'login', code: '123456' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phoneNumber: '01000000001' })
        .expect(404);
      expect(res.body.detail).toBeDefined();
      expect(typeof res.body.detail).toBe('string');
    });

    it('인증 필요 API 토큰 없이 → 401', async () => {
      await request(app.getHttpServer()).get('/recommendations/rec-1').expect(401);
      await request(app.getHttpServer()).get('/diagnosis/latest').expect(401);
      await request(app.getHttpServer()).get('/diagnosis/pattern').expect(401);
      await request(app.getHttpServer()).get('/notifications/preferences').expect(401);
    });

    it('GET /recommendations 전역 템플릿 응답 스키마 (인증 불필요)', async () => {
      const res = await request(app.getHttpServer())
        .get('/recommendations')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        const r = res.body[0];
        // 핵심 필드 존재
        expect(r.id).toBeDefined();
        expect(r.grade).toBeDefined();
        expect(r.title).toBeDefined();
        // sourceLabel은 A등급 템플릿에 존재
        expect(r.sourceLabel).toBeDefined();
      }
    });

    it('GET /products 카탈로그 응답 스키마', async () => {
      const res = await request(app.getHttpServer()).get('/products').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        const p = res.body[0];
        expect(p.id).toBeDefined();
        expect(p.name).toBeDefined();
        expect(p.category).toBeDefined();
        expect(p.matchedGrade).toBeDefined();
      }
    });
  });
});
