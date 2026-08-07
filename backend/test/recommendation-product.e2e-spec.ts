import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { GeminiClient } from '../src/modules/gemini/gemini.client';
import { KmaClient } from '../src/modules/weather/clients/kma.client';
import { AirKoreaClient } from '../src/modules/weather/clients/airkorea.client';
import { StationClient } from '../src/modules/weather/clients/station.client';
import { signupWithOtp, loginWithOtp } from './helpers/auth-flow';
import { grantRecommendationTransfer } from './helpers/consent-flow';

/**
 * Recommendation/Product e2e 테스트.
 * 실제 test DB(todayskin_test) + MOCK_GEMINI=true로 전체 HTTP 경로를 검증한다.
 */
describe('Recommendation & Product (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: number;

  const testPhone = '01066666666';

  beforeAll(async () => {
    // AppModule이 초기화되기 전에 환경변수를 설정해야 ConfigService가 읽을 수 있다.
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://todayskin:secret@localhost:5432/todayskin_test';
    process.env.JWT_ACCESS_SECRET = 'e2e_access_secret_at_least_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'e2e_refresh_secret_at_least_32_characters_long';
    process.env.ALLOWED_ORIGINS = '';
    // N2: OTP allowlist로 고정 OTP(123456) 사용.
    process.env.OTP_ALLOWLIST_PHONES = '01066666666,01055555554';
    // Gemini는 아래 provider override로 고정한다. process.env를 공유하는
    // Jest worker에 mock 플래그를 남기지 않아 다른 e2e suite와 격리한다.

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // 다른 e2e suite가 먼저 AppModule을 초기화해도 환경변수 상태에
      // 의존하지 않도록 Gemini 경계를 명시적으로 mock한다.
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
        generateWeatherProducts: jest.fn().mockResolvedValue([
          {
            timing: '세안 후',
            category: 'barrier',
            name: '보습 토너',
            brand: 'TestLab',
            explanation: '세안 후 수분 보충에 도움될 수 있어요.',
            ingredientTags: ['판테놀'],
          },
          {
            timing: '외출 전',
            category: 'barrier',
            name: '데일리 선크림',
            brand: 'TestLab',
            explanation: '외출 전 보호에 도움될 수 있어요.',
            ingredientTags: ['징크옥사이드'],
          },
          {
            timing: '외출 후',
            category: 'moisture',
            name: '휴대용 미스트',
            brand: 'TestLab',
            explanation: '외출 후 수분 보충에 도움될 수 있어요.',
            ingredientTags: ['히알루론산'],
          },
        ]),
      })
      // N12: 서버 소유 날씨 — weather-based 제품 생성이 WeatherService를 거치므로
      // 정부 API 경계를 고정값으로 mock해 LIVE 날씨를 결정적으로 만든다.
      // (키가 없으면 실클라이언트가 전부 null → UNAVAILABLE → 스냅샷 의존이 되므로)
      .overrideProvider(KmaClient)
      .useValue({
        fetchUvIndex: jest.fn().mockResolvedValue({
          current: 5,
          peak: 7,
          peakHour: 13,
          observedAt: new Date(),
        }),
      })
      .overrideProvider(AirKoreaClient)
      .useValue({
        fetchAirQuality: jest.fn().mockResolvedValue({
          ozone: 0.03,
          pm25: 12,
          pm10: 25,
          cai: 80,
          no2: 0.02,
          so2: 0.004,
          co: 0.4,
          observedAt: new Date(),
        }),
      })
      .overrideProvider(StationClient)
      .useValue({
        fetchNearestStation: jest.fn().mockResolvedValue({
          stationName: '종로구',
          cityName: '서울특별시',
        }),
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

    // 테스트용 사용자 가입 후 accessToken 획득
    const signupRes = await signupWithOtp(app, testPhone, {
      name: '테스터',
      birthDate: '2000-01-01',
    });
    accessToken = signupRes.body.accessToken;
    userId = signupRes.body.id;
    // N3: Gemini 추천 생성에 transfer 동의 필수
    await grantRecommendationTransfer(app, accessToken);
  });

  afterAll(async () => {
    await prisma.recommendation.deleteMany({ where: { userId } });
    await prisma.consentRecord.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.otpCode.deleteMany({
      where: { phoneNumber: { in: [testPhone, '01055555554'] } },
    });
    await prisma.refreshSession.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { phoneNumber: '01055555554' } });
    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });
    await app.close();
  });

  describe('GET /recommendations', () => {
    it('전역 A등급 템플릿 목록 반환 (인증 불필요)', async () => {
      const res = await request(app.getHttpServer())
        .get('/recommendations')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect((res.body as unknown[]).length).toBeGreaterThan(0);
      // seed의 rec-1 (A등급)이 포함되어야 한다
      const aGrade = (res.body as Array<{ id: string; grade: string }>).find(
        (r) => r.id === 'rec-1',
      );
      expect(aGrade).toBeDefined();
      expect(aGrade!.grade).toBe('A');
    });

    it('grade=A 필터 동작', async () => {
      const res = await request(app.getHttpServer())
        .get('/recommendations?grade=A')
        .expect(200);

      expect(
        (res.body as Array<{ grade: string }>).every((r) => r.grade === 'A'),
      ).toBe(true);
    });
  });

  describe('POST /recommendations/generate', () => {
    it('인증 없이 호출 시 401', async () => {
      await request(app.getHttpServer())
        .post('/recommendations/generate')
        .send({ skinScore: {}, weather: {} })
        .expect(401);
    });

    it('인증 + mock Gemini로 B등급 추천 생성', async () => {
      const res = await request(app.getHttpServer())
        .post('/recommendations/generate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          skinScore: { id: 'snap-1', overallScore: 70 },
          weather: { uvIndex: 5, pm25: 20 },
        })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].grade).toBe('B');
      expect(res.body[0].sourceLabel).toBe(
        'AI 종합 분석 · 피부과학 일반 지식 기반',
      );
      expect(res.body[0].ingredientTags).toBeDefined();
    });
  });

  describe('GET /recommendations/:id', () => {
    it('전역 템플릿 상세 조회 (인증 필요)', async () => {
      const res = await request(app.getHttpServer())
        .get('/recommendations/rec-1')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe('rec-1');
      expect(res.body.grade).toBe('A');
    });

    it('인증 없이 호출 시 401', async () => {
      await request(app.getHttpServer())
        .get('/recommendations/rec-1')
        .expect(401);
    });

    it('존재하지 않는 id 시 404', async () => {
      await request(app.getHttpServer())
        .get('/recommendations/no-such-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /products', () => {
    it('카탈로그 전체 반환', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('category=moisture 필터 동작', async () => {
      const res = await request(app.getHttpServer())
        .get('/products?category=moisture')
        .expect(200);

      expect(
        (res.body as Array<{ category: string }>).every(
          (p) => p.category === 'moisture',
        ),
      ).toBe(true);
    });
  });

  describe('POST /products/weather-based', () => {
    it('인증 없이 호출 시 401', async () => {
      await request(app.getHttpServer())
        .post('/products/weather-based')
        .send({ lat: 37.5665, lon: 126.978 })
        .expect(401);
    });

    it('날씨 기반 제품 3개 생성 — reason, timing 포함', async () => {
      const res = await request(app.getHttpServer())
        .post('/products/weather-based')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ lat: 37.5665, lon: 126.978 })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(3);
      // 각 제품은 reason, timing, grade=A를 포함해야 한다
      for (const p of res.body) {
        expect(p.matchedGrade).toBe('A');
        expect(p.reason).toBeDefined();
        expect(p.timing).toBeDefined();
        expect(['세안 후', '외출 전', '외출 후']).toContain(p.timing);
      }
      // timing이 세 상황 모두 포함
      const timings = (res.body as Array<{ timing: string }>)
        .map((p) => p.timing)
        .sort();
      expect(timings).toEqual(['세안 후', '외출 전', '외출 후']);
    });
  });

  describe('추천 생성 + 상세 소유권', () => {
    it('생성한 추천을 본인이 조회 성공', async () => {
      const genRes = await request(app.getHttpServer())
        .post('/recommendations/generate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ skinScore: { id: 'snap-2', overallScore: 65 }, weather: {} })
        .expect(200);

      const createdId = genRes.body[0].id;

      const detailRes = await request(app.getHttpServer())
        .get(`/recommendations/${createdId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detailRes.body.id).toBe(createdId);
      expect(detailRes.body.grade).toBe('B');
    });

    it('타 사용자 추천 조회 시 403', async () => {
      // 두 번째 사용자 가입 — 고유 전화번호 사용
      const otherPhone = '01055555554';
      let otherToken: string;
      let otherUserId: number;
      // N2: OTP 흐름으로 가입(409면 기존 사용자이므로 로그인).
      const otherSignup = await signupWithOtp(app, otherPhone, {
        name: '다른사람',
        birthDate: '1990-01-01',
      });
      if (otherSignup.status === 201) {
        otherToken = otherSignup.body.accessToken;
        otherUserId = otherSignup.body.id;
      } else {
        const loginRes = await loginWithOtp(app, otherPhone);
        otherToken = loginRes.body.accessToken;
        otherUserId = loginRes.body.id;
      }

      // 첫 사용자가 추천 생성
      const genRes = await request(app.getHttpServer())
        .post('/recommendations/generate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ skinScore: { id: 'snap-3', overallScore: 80 }, weather: {} })
        .expect(200);

      const createdId = genRes.body[0].id;

      // 두 번째 사용자가 조회 → 403
      await request(app.getHttpServer())
        .get(`/recommendations/${createdId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      // 정리
      await prisma.recommendation.deleteMany({ where: { userId: otherUserId } });
      await prisma.refreshSession.deleteMany({ where: { userId: otherUserId } });
      await prisma.user.deleteMany({ where: { phoneNumber: otherPhone } });
    });
  });

  describe('동일 진단 중복 생성 방지', () => {
    it('같은 diagnosisId로 두 번 생성 시 기존 추천 반환 (Gemini 호출 1회)', async () => {
      // 진단 레코드 생성
      const diagnosis = await prisma.diagnosis.create({
        data: {
          id: 'diag-e2e-dup',
          userId,
          capturedAt: new Date(),
          overallScore: 72,
          status: 'COMPLETED',
        },
      });

      // 진단이 본인 소유인지 확인
      expect(diagnosis.userId).toBe(userId);

      const first = await request(app.getHttpServer())
        .post('/recommendations/generate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ diagnosisId: diagnosis.id })
        .expect(200);

      // 첫 번째 생성 후 DB에 추천이 저장되었는지 확인
      const savedCount = await prisma.recommendation.count({
        where: { diagnosisId: diagnosis.id, userId },
      });
      expect(savedCount).toBe(first.body.length);

      const second = await request(app.getHttpServer())
        .post('/recommendations/generate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ diagnosisId: diagnosis.id })
        .expect(200);

      // 두 번째는 Gemini를 다시 호출하지 않고 기존 추천을 반환한다
      const firstIds = (first.body as Array<{ id: string }>)
        .map((r) => r.id)
        .sort();
      const secondIds = (second.body as Array<{ id: string }>)
        .map((r) => r.id)
        .sort();
      expect(secondIds).toEqual(firstIds);

      // 정리
      await prisma.recommendation.deleteMany({ where: { diagnosisId: diagnosis.id } });
      await prisma.diagnosis.delete({ where: { id: diagnosis.id } });
    });
  });

  describe('N14 외부 AI 호출 멱등성', () => {
    it('같은 diagnosisId 동시 요청 → Gemini 1회만 호출, 200 + 409', async () => {
      const geminiClient = app.get(GeminiClient) as {
        generateRecommendations: jest.Mock;
      };
      const original = geminiClient.generateRecommendations.getMockImplementation();
      // 두 요청이 in-flight 구간에 겹치도록 Gemini 응답에 지연을 건다.
      // (B의 사전 경로: JWT + 동의 + 진단 조회 + 예약 ≈ 수백 ms — 1s로 여유 확보)
      const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      geminiClient.generateRecommendations.mockImplementation(async () => {
        await delay(1000);
        return [
          {
            title: '동시 생성 추천',
            explanation: '동시 요청 테스트',
            ingredientTags: [],
            timing: '외출 후',
          },
        ];
      });

      const diagnosis = await prisma.diagnosis.create({
        data: {
          id: 'diag-e2e-n14',
          userId,
          capturedAt: new Date(),
          overallScore: 70,
          status: 'COMPLETED',
        },
      });

      try {
        const [a, b] = await Promise.all([
          request(app.getHttpServer())
            .post('/recommendations/generate')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ diagnosisId: diagnosis.id }),
          request(app.getHttpServer())
            .post('/recommendations/generate')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ diagnosisId: diagnosis.id }),
        ]);

        // N14 핵심: Gemini는 정확히 1회만 호출된다 (비용 중복 방지).
        expect(geminiClient.generateRecommendations).toHaveBeenCalledTimes(1);
        // 하나는 성공, 다른 하나는 in-flight 예약 충돌 409.
        expect([a.status, b.status].sort()).toEqual([200, 409]);
      } finally {
        // 단언 실패 시에도 mock/DB를 복구해 후속 테스트 오염을 막는다.
        geminiClient.generateRecommendations.mockImplementation(original!);
        await prisma.recommendation.deleteMany({ where: { diagnosisId: diagnosis.id } });
        await prisma.aiCallReservation.deleteMany({
          where: { scopeKey: `recommendation:${diagnosis.id}` },
        });
        await prisma.diagnosis.delete({ where: { id: diagnosis.id } }).catch(() => undefined);
      }
    });
  });
});
