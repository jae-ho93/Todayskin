import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { OpenAiClient } from '../src/modules/openai/openai.client';
import { KmaClient } from '../src/modules/weather/clients/kma.client';
import { AirKoreaClient } from '../src/modules/weather/clients/airkorea.client';
import { StationClient } from '../src/modules/weather/clients/station.client';
import { signupWithOtp, loginWithOtp } from './helpers/auth-flow';
import { grantRecommendationTransfer } from './helpers/consent-flow';
import { waitForJob } from './helpers/job-polling';
import { JobStatus } from '../src/modules/jobs/enums/job-status.enum';
import { PRODUCTS } from '../prisma/seed-data';

/**
 * Recommendation/Product e2e 테스트.
 * 실제 test DB(todayskin_test) + MOCK_OPENAI=true로 전체 HTTP 경로를 검증한다.
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
    // OpenAI는 아래 provider override로 고정한다. process.env를 공유하는
    // Jest worker에 mock 플래그를 남기지 않아 다른 e2e suite와 격리한다.

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // 다른 e2e suite가 먼저 AppModule을 초기화해도 환경변수 상태에
      // 의존하지 않도록 OpenAI 경계를 명시적으로 mock한다.
      .overrideProvider(OpenAiClient)
      .useValue({
        generateRecommendations: jest.fn().mockResolvedValue([
          {
            title: '이중 세안 권장',
            explanation: '오늘 환경에 맞춘 관리가 도움될 수 있어요.',
            ingredientTags: ['세라마이드'],
            timing: '외출 후',
          },
        ]),
        // N27: 가상 제품을 만들지 않고 seed된 실제 카탈로그의 id를 선택한다.
        generateWeatherProducts: jest.fn().mockResolvedValue([
          {
            timing: '세안 후',
            productId: 'prod-11',
            explanation: '세안 후 피부결 정돈에 도움될 수 있어요.',
          },
          {
            timing: '외출 전',
            productId: 'prod-2',
            explanation: '외출 전 자외선 관리에 도움될 수 있어요.',
          },
          {
            timing: '외출 후',
            productId: 'prod-13',
            explanation: '외출 후 수분 보충에 도움될 수 있어요.',
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
        fetchNowcast: jest.fn().mockResolvedValue({
          temperature: 24.5,
          humidity: 55,
          observedAt: new Date(),
          failed: false,
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

    // N27: 날씨 기반 제품은 실제 카탈로그만 사용하므로 seed 데이터(실제품)를 준비한다.
    // (suite 순서에 독립적으로 동작하도록 이 suite가 필요한 제품을 직접 upsert한다.)
    for (const p of PRODUCTS) {
      await prisma.product.upsert({
        where: { id: p.id },
        update: { ...p },
        create: { ...p },
      });
    }

    // 테스트용 사용자 가입 후 accessToken 획득
    const signupRes = await signupWithOtp(app, testPhone, {
      name: '테스터',
      birthDate: '2000-01-01',
    });
    accessToken = signupRes.body.accessToken;
    userId = signupRes.body.id;
    // N3: OpenAI 추천 생성에 transfer 동의 필수
    await grantRecommendationTransfer(app, accessToken);
  });

  // N4/Inline dispatcher job polling 헬퍼 — test/helpers/job-polling.ts 공용.

  afterAll(async () => {
    // N27: 이 suite가 시드한 실제품을 정리한다 (RecommendationProduct는 Cascade로 함께 삭제).
    await prisma.product.deleteMany({
      where: { id: { in: PRODUCTS.map((p) => p.id) } },
    });
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
      const aGrade = (res.body as Array<{ id: string; grade: string; relatedProductIds: string[] }>).find(
        (r) => r.id === 'rec-1',
      );
      expect(aGrade).toBeDefined();
      expect(aGrade!.grade).toBe('A');
      // N20: 목록 응답에도 관련 제품이 채워진다.
      expect(aGrade!.relatedProductIds).toContain('prod-1');
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

    it('인증 + mock OpenAI로 B등급 추천 생성', async () => {
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
      // N45: B는 사진+날씨로 만든 생성물이라 인용할 문헌이 없다. 출처 칸을
      // 그럴듯한 문구로 채우는 대신 생성물임을 밝히고 sources를 비운다.
      expect(res.body[0].sourceLabel).toBe('AI 생성 · 내 진단 결과 기반');
      expect(res.body[0].sources).toEqual([]);
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
      // N45: A등급은 "공인 가이드라인"이라고 표기하므로 가리킬 문서가 실제로
      // 있어야 한다. 없으면 등급 자체가 과장이다.
      expect(res.body.sources.length).toBeGreaterThan(0);
      expect(res.body.sources[0].url).toMatch(/^https:\/\//);
      // N20: seed가 템플릿↔제품을 연결하므로 관련 제품이 실제로 반환된다.
      expect(Array.isArray(res.body.relatedProductIds)).toBe(true);
      expect(res.body.relatedProductIds).toContain('prod-1');
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

  describe('POST /products/weather-based (N32/N29 빠른 경로)', () => {
    it('인증 없이 호출 시 401', async () => {
      await request(app.getHttpServer())
        .post('/products/weather-based')
        .send({ lat: 37.5665, lon: 126.978 })
        .expect(401);
    });

    it('FALLBACK 실제품 3개 즉시 반환 + jobId, job 완료 시 LIVE로 교체', async () => {
      const res = await request(app.getHttpServer())
        .post('/products/weather-based')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ lat: 37.5665, lon: 126.978 })
        .expect(200);

      // 첫 응답이 배열이 아니라 { source, jobId, items } 래퍼 계약이다.
      expect(res.body.source).toBe('FALLBACK');
      expect(res.body.jobId).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items).toHaveLength(3);
      // 각 제품은 실제 카탈로그 제품(reason, timing, grade=A, purchaseUrl)이어야 한다
      for (const p of res.body.items) {
        expect(p.matchedGrade).toBe('A');
        expect(p.reason).toBeDefined();
        expect(p.timing).toBeDefined();
        expect(['세안 후', '외출 전', '외출 후']).toContain(p.timing);
        // N24: 노출 제품은 purchaseUrl을 가진 실제품이어야 한다
        expect(p.purchaseUrl).toBeDefined();
        expect(p.purchaseUrl).toMatch(/^https?:\/\//);
        expect(p.id).not.toMatch(/^openai-product-/);
      }
      // timing이 세 상황 모두 포함
      const timings = (res.body.items as Array<{ timing: string }>)
        .map((p) => p.timing)
        .sort();
      expect(timings).toEqual(['세안 후', '외출 전', '외출 후']);

      // job 완료 후 LIVE 결과도 실제품 + purchaseUrl (가상 제품 없음)
      const final = await waitForJob(app, accessToken, res.body.jobId);
      expect(final.status).toBe(JobStatus.COMPLETED);
      const liveResult = final.result as { products: Array<Record<string, unknown>> };
      expect(liveResult.products).toHaveLength(3);
      for (const p of liveResult.products) {
        expect(p.purchaseUrl).toBeDefined();
        expect(String(p.id)).not.toMatch(/^openai-product-/);
      }
    });
  });

  describe('POST /recommendations/generate/fast (N32/N29 빠른 경로)', () => {
    it('인증 없이 호출 시 401', async () => {
      await request(app.getHttpServer())
        .post('/recommendations/generate/fast')
        .send({ diagnosisId: 'diag-e2e-fast' })
        .expect(401);
    });

    it('FALLBACK 즉시 반환 + jobId → job 완료 후 LIVE로 교체 (가상 제품 없음)', async () => {
      const diagnosis = await prisma.diagnosis.create({
        data: {
          id: 'diag-e2e-fast',
          userId,
          capturedAt: new Date(),
          overallScore: 71,
          status: 'COMPLETED',
        },
      });

      try {
        // 1) 첫 요청 — DB/Redis에 결과가 없으므로 규칙 기반 FALLBACK + jobId.
        const res = await request(app.getHttpServer())
          .post('/recommendations/generate/fast')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ diagnosisId: diagnosis.id })
          .expect(200);

        expect(res.body.source).toBe('FALLBACK');
        expect(res.body.jobId).toBeDefined();
        expect(Array.isArray(res.body.recommendations)).toBe(true);
        expect(res.body.recommendations.length).toBeGreaterThan(0);
        for (const r of res.body.recommendations) {
          // N31: FALLBACK도 가상 추천 id가 아니고 실제 카탈로그 제품만 연결한다.
          expect(String(r.id)).not.toMatch(/^openai-/);
          expect(
            (r.relatedProductIds as string[]).every((pid) =>
              pid.startsWith('prod-'),
            ),
          ).toBe(true);
        }

        // 2) job 완료 → LIVE 추천 (DB 저장 결과).
        const final = await waitForJob(app, accessToken, res.body.jobId);
        expect(final.status).toBe(JobStatus.COMPLETED);
        const liveRecs = (final.result as { recommendations: Array<Record<string, unknown>> })
          .recommendations;
        expect(liveRecs.length).toBeGreaterThan(0);
        expect(String(liveRecs[0].id)).toMatch(/^openai-/);

        // 3) 재호출 — 저장된 LIVE 추천을 즉시 반환한다 (OpenAI 재호출 없음).
        const second = await request(app.getHttpServer())
          .post('/recommendations/generate/fast')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ diagnosisId: diagnosis.id })
          .expect(200);
        expect(second.body.source).toBe('LIVE');
        expect(second.body.recommendations.length).toBeGreaterThan(0);
      } finally {
        await prisma.recommendation.deleteMany({
          where: { diagnosisId: diagnosis.id },
        });
        await prisma.aiCallReservation.deleteMany({
          where: { scopeKey: `recommendation:${diagnosis.id}` },
        });
        await prisma.diagnosis.delete({ where: { id: diagnosis.id } }).catch(() => undefined);
      }
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
    it('같은 diagnosisId로 두 번 생성 시 기존 추천 반환 (OpenAI 호출 1회)', async () => {
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

      // 두 번째는 OpenAI를 다시 호출하지 않고 기존 추천을 반환한다
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
    it('같은 diagnosisId 동시 요청 → OpenAI 1회만 호출, 200 + 409', async () => {
      const openAiClient = app.get(OpenAiClient) as {
        generateRecommendations: jest.Mock;
      };
      // suite 내 이전 테스트들이 같은 mock을 호출해 카운트가 누적됐으므로
      // 이 테스트의 호출 횟수만 검사하도록 초기화한다.
      openAiClient.generateRecommendations.mockClear();
      const original = openAiClient.generateRecommendations.getMockImplementation();
      // 두 요청이 in-flight 구간에 겹치도록 OpenAI 응답에 지연을 건다.
      // (B의 사전 경로: JWT + 동의 + 진단 조회 + 예약 ≈ 수백 ms — 1s로 여유 확보)
      const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      openAiClient.generateRecommendations.mockImplementation(async () => {
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

        // N14 핵심: OpenAI는 정확히 1회만 호출된다 (비용 중복 방지).
        expect(openAiClient.generateRecommendations).toHaveBeenCalledTimes(1);
        // 하나는 성공, 다른 하나는 in-flight 예약 충돌 409.
        expect([a.status, b.status].sort()).toEqual([200, 409]);
      } finally {
        // 단언 실패 시에도 mock/DB를 복구해 후속 테스트 오염을 막는다.
        openAiClient.generateRecommendations.mockImplementation(original!);
        await prisma.recommendation.deleteMany({ where: { diagnosisId: diagnosis.id } });
        await prisma.aiCallReservation.deleteMany({
          where: { scopeKey: `recommendation:${diagnosis.id}` },
        });
        await prisma.diagnosis.delete({ where: { id: diagnosis.id } }).catch(() => undefined);
      }
    });
  });
});
