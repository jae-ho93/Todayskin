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
import { grantConsent, grantDiagnosisProcessing } from './helpers/consent-flow';
import { ConsentPurpose } from '../src/modules/consent/enums/consent-purpose.enum';
import { IMAGE_OBJECT_STORE } from '../src/modules/storage/providers/image-object-store.interface';
import { MemoryImageObjectStore } from '../src/modules/storage/providers/memory-image-object-store';
import { formatKstDate } from '../src/modules/diagnosis/calendar-date.util';

/**
 * N43: 진단 기록 삭제 e2e.
 *
 * 단위 테스트는 "무엇을 호출했는가"만 본다. 삭제가 실제로 사라짐을 뜻하려면
 * 지운 뒤 목록·캘린더·추이에서 정말 빠지는지를 API로 확인해야 한다.
 */
describe('Diagnosis Delete (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: number;
  let memoryStore: MemoryImageObjectStore;

  const testPhone = '01077770043';

  const JPEG_1x1 = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrq6tba2t7i5usLFxsfIycrO0NHS09TV1tfY2drq6+vsLTz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhCRJFiGQYHR8VjQoLxaKyEjOTFS8pHj4xQlRJU1VWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqLjI2Oj5KSk5SVlpeYmZqYm5ydXp6cnqcoqSlpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drq6+vr/9sAQwA',
    'base64',
  );

  const nullWeather = {
    current: null,
    peak: null,
    peakHour: null,
    observedAt: null,
    failed: false,
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://todayskin:secret@localhost:5432/todayskin_test';
    process.env.JWT_ACCESS_SECRET = 'e2e_access_secret_at_least_32_characters_long';
    process.env.JWT_REFRESH_SECRET = 'e2e_refresh_secret_at_least_32_characters_long';
    process.env.ALLOWED_ORIGINS = '';
    process.env.MOCK_INFERENCE = 'true';
    process.env.MOCK_GEMINI = 'true';
    process.env.OTP_ALLOWLIST_PHONES = testPhone;
    process.env.S3_BUCKET = '';

    memoryStore = new MemoryImageObjectStore('todayskin-e2e-n43');

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KmaClient)
      .useValue({
        fetchUvIndex: jest.fn().mockResolvedValue(nullWeather),
        fetchNowcast: jest.fn().mockResolvedValue({
          temperature: null,
          humidity: null,
          observedAt: null,
          failed: false,
        }),
      })
      .overrideProvider(AirKoreaClient)
      .useValue({
        fetchAirQuality: jest.fn().mockResolvedValue({
          ozone: null,
          pm25: null,
          pm10: null,
          cai: null,
          no2: null,
          so2: null,
          co: null,
          observedAt: null,
          failed: false,
        }),
      })
      .overrideProvider(StationClient)
      .useValue({ fetchNearestStation: jest.fn().mockResolvedValue(null) })
      .overrideProvider(RedisService)
      .useValue({
        isAvailable: jest.fn().mockReturnValue(false),
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(true),
        incrementCounter: jest.fn().mockResolvedValue(null),
      })
      .overrideProvider(IMAGE_OBJECT_STORE)
      .useValue(memoryStore)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    prisma = app.get(PrismaService);
    await app.init();
    await prisma.$connect();

    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });

    const signup = await signupWithOtp(app, testPhone, {
      name: 'N43삭제',
      birthDate: '1995-01-01',
    });
    expect(signup.status).toBe(201);
    accessToken = signup.body.accessToken;
    userId = signup.body.id;

    await grantDiagnosisProcessing(app, accessToken);
    await grantConsent(app, accessToken, ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE);
    await grantConsent(app, accessToken, ConsentPurpose.AI_RECOMMENDATION_DATA_TRANSFER);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.diagnosisImage.deleteMany({ where: { userId } });
      // RecommendationProduct는 Cascade로 함께 지워진다. 관계 필터로 직접 지우면
      // recommendationId가 null인 seed의 템플릿↔제품 링크까지 걸린다.
      await prisma.recommendation.deleteMany({ where: { userId } });
      await prisma.diagnosis.deleteMany({ where: { userId } });
      await prisma.consentRecord.deleteMany({ where: { userId } });
      await prisma.refreshSession.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  /** 제출은 dedup window(60초)에 걸리므로 직전 진단의 createdAt을 과거로 민다. */
  async function submitDiagnosis(): Promise<{ id: string; date: string }> {
    await prisma.diagnosis.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    const res = await request(app.getHttpServer())
      .post('/diagnosis')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('front', JPEG_1x1, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .expect(201);
    return { id: res.body.id as string, date: formatKstDate(new Date(res.body.capturedAt)) };
  }

  it('본인 기록을 지우면 목록·캘린더·추이에서 함께 빠진다', async () => {
    const { id, date } = await submitDiagnosis();

    await request(app.getHttpServer())
      .delete(`/diagnosis/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const history = await request(app.getHttpServer())
      .get('/diagnosis/history')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const rows = Array.isArray(history.body) ? history.body : history.body.items;
    expect(rows.some((r: { id: string }) => r.id === id)).toBe(false);

    const day = await request(app.getHttpServer())
      .get(`/diagnosis/history/${date}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(day.body.diagnoses.some((d: { id: string }) => d.id === id)).toBe(false);

    // 추이가 지운 기록을 계속 반영하면 사용자에게는 삭제가 안 된 것으로 보인다.
    const series = await request(app.getHttpServer())
      .get('/diagnosis/score-series')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      series.body.points.some((p: { diagnosisId: string }) => p.diagnosisId === id),
    ).toBe(false);
  });

  it('이미지·부위 점수·추천이 DB와 객체 저장소에서 모두 사라진다', async () => {
    const { id } = await submitDiagnosis();

    // 추천을 생성해 진단에 매달아 둔다 — SetNull이라 방치하면 고아로 남는다.
    await request(app.getHttpServer())
      .post('/recommendations/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ diagnosisId: id })
      .expect((res) => {
        if (![200, 201].includes(res.status)) {
          throw new Error(`추천 생성 실패: ${res.status} ${JSON.stringify(res.body)}`);
        }
      });

    const image = await prisma.diagnosisImage.findUnique({ where: { diagnosisId: id } });
    expect(image).toBeTruthy();
    expect(memoryStore.has(image!.s3Key)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/diagnosis/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    expect(memoryStore.has(image!.s3Key)).toBe(false);
    expect(await prisma.diagnosis.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.diagnosisImage.findUnique({ where: { diagnosisId: id } })).toBeNull();
    expect(await prisma.skinMetric.count({ where: { diagnosisId: id } })).toBe(0);
    expect(await prisma.recommendation.count({ where: { diagnosisId: id } })).toBe(0);
    // SetNull로 살아남은 고아 추천이 없어야 한다.
    expect(await prisma.recommendation.count({ where: { userId, diagnosisId: null } })).toBe(0);
  });

  it('삭제된 기록을 다시 지우면 404', async () => {
    const { id } = await submitDiagnosis();

    await request(app.getHttpServer())
      .delete(`/diagnosis/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/diagnosis/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('인증 없이는 지울 수 없다', async () => {
    const { id } = await submitDiagnosis();

    await request(app.getHttpServer()).delete(`/diagnosis/${id}`).expect(401);

    expect(await prisma.diagnosis.findUnique({ where: { id } })).toBeTruthy();
  });
});
