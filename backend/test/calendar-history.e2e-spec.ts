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
import {
  grantConsent,
  grantDiagnosisProcessing,
} from './helpers/consent-flow';
import { ConsentPurpose } from '../src/modules/consent/enums/consent-purpose.enum';
import { IMAGE_OBJECT_STORE } from '../src/modules/storage/providers/image-object-store.interface';
import { MemoryImageObjectStore } from '../src/modules/storage/providers/memory-image-object-store';
import { formatKstDate } from '../src/modules/diagnosis/calendar-date.util';

/**
 * N8: 히스토리 캘린더 e2e.
 */
describe('Calendar History (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: number;
  let memoryStore: MemoryImageObjectStore;

  const testPhone = '01077770008';

  // N26: '저장 동의' 테스트가 만든 진단을 다음 테스트(이미지 삭제 후 미노출)가 재사용한다.
  let consentedDiagnosisId: string;
  let consentedDate: string;

  const JPEG_1x1 = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrq6tba2t7i5usLFxsfIycrO0NHS09TV1tfY2drq6+vsLTz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhCRJFiGQYHR8VjQoLxaKyEjOTFS8pHj4xQlRJU1VWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqLjI2Oj5KSk5SVlpeYmZqYm5ydXp6cnqcoqSlpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drq6+vr/9sAQwA',
    'base64',
  );

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

    memoryStore = new MemoryImageObjectStore('todayskin-e2e-n8');

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KmaClient)
      .useValue({
        fetchUvIndex: jest.fn().mockResolvedValue({
          current: null,
          peak: null,
          peakHour: null,
          observedAt: null,
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
        }),
      })
      .overrideProvider(StationClient)
      .useValue({ fetchNearestStation: jest.fn().mockResolvedValue(null) })
      .overrideProvider(RedisService)
      .useValue({
        isAvailable: jest.fn().mockReturnValue(false),
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(true),
        // N11: WeatherService가 캐시 hit/miss 지표를 기록하므로 mock에도 필요.
        incrementCounter: jest.fn().mockResolvedValue(null),
      })
      .overrideProvider(IMAGE_OBJECT_STORE)
      .useValue(memoryStore)
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

    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });

    const signup = await signupWithOtp(app, testPhone, {
      name: 'N8캘린더',
      birthDate: '1995-01-01',
    });
    expect(signup.status).toBe(201);
    accessToken = signup.body.accessToken;
    userId = signup.body.id;

    await grantDiagnosisProcessing(app, accessToken);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.diagnosisImage.deleteMany({ where: { userId } });
      await prisma.skinMetric.deleteMany({
        where: { diagnosis: { userId } },
      });
      await prisma.recommendationProduct.deleteMany({
        where: { recommendation: { userId } },
      });
      await prisma.recommendation.deleteMany({ where: { userId } });
      await prisma.diagnosis.deleteMany({ where: { userId } });
      await prisma.consentRecord.deleteMany({ where: { userId } });
      await prisma.refreshSession.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it('날짜 형식 오류는 400', async () => {
    await request(app.getHttpServer())
      .get('/diagnosis/history/2026-13-40')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('저장 미동의 진단은 image/landmarks를 숨긴다', async () => {
    const submit = await request(app.getHttpServer())
      .post('/diagnosis')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('front', JPEG_1x1, {
        filename: 'front.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    const diagnosisId = submit.body.id as string;
    const date = formatKstDate(new Date(submit.body.capturedAt));

    // landmarks는 저장 동의 없을 때 DB에도 없어야 한다.
    const row = await prisma.diagnosis.findUnique({ where: { id: diagnosisId } });
    expect(row?.landmarks).toBeNull();

    const history = await request(app.getHttpServer())
      .get(`/diagnosis/history/${date}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(history.body.date).toBe(date);
    expect(history.body.diagnoses.length).toBeGreaterThanOrEqual(1);
    const entry = history.body.diagnoses.find(
      (d: { id: string }) => d.id === diagnosisId,
    );
    expect(entry).toBeDefined();
    expect(entry.parts.length).toBe(6);
    expect(entry.image).toBeNull();
    expect(entry.landmarks).toBeNull();
  });

  it('저장 동의 후 이미지·랜드마크·시계열이 조회된다', async () => {
    await grantConsent(
      app,
      accessToken,
      ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE,
    );

    // dedup window 회피
    await prisma.diagnosis.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });

    const submit = await request(app.getHttpServer())
      .post('/diagnosis')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('front', JPEG_1x1, {
        filename: 'front.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    const diagnosisId = submit.body.id as string;
    const date = formatKstDate(new Date(submit.body.capturedAt));

    const row = await prisma.diagnosis.findUnique({
      where: { id: diagnosisId },
      include: { image: true },
    });
    expect(row?.landmarks).toBeTruthy();
    expect(row?.image?.deletedAt).toBeNull();

    // N26: 다음 테스트(이미지 없음)에서 이 진단을 재사용한다.
    consentedDiagnosisId = diagnosisId;
    consentedDate = date;

    const history = await request(app.getHttpServer())
      .get(`/diagnosis/history/${date}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const entry = history.body.diagnoses.find(
      (d: { id: string }) => d.id === diagnosisId,
    );
    // BE-2026-08-12: memory 스토어는 RN Image 로드 가능한 dev-storage http URL을 발급한다
    expect(entry.image?.url).toMatch(/^http:\/\/127\.0\.0\.1:3000\/dev-storage\//);
    expect(entry.image?.contentType).toBe('image/jpeg');
    expect(entry.landmarks?.version).toBe('mediapipe-face-landmarker-v1');
    expect(Array.isArray(entry.landmarks?.points)).toBe(true);

    const series = await request(app.getHttpServer())
      .get('/diagnosis/score-series')
      .query({ from: date, to: date })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(series.body.from).toBe(date);
    expect(series.body.to).toBe(date);
    expect(
      series.body.points.some(
        (p: { diagnosisId: string }) => p.diagnosisId === diagnosisId,
      ),
    ).toBe(true);
  });

  it('N26: 저장 동의 + 이미지 삭제 후에는 image/landmarks를 숨긴다 (이미지 없음)', async () => {
    expect(consentedDiagnosisId).toBeDefined();

    // 저장 동의가 활성 상태인데 이미지가 soft-delete된 상황을 재현한다.
    await prisma.diagnosisImage.updateMany({
      where: { diagnosisId: consentedDiagnosisId },
      data: { deletedAt: new Date() },
    });

    // DB의 landmarks는 감사 보존 정책상 남아 있을 수 있지만 노출되면 안 된다.
    const row = await prisma.diagnosis.findUnique({
      where: { id: consentedDiagnosisId },
    });
    expect(row?.landmarks).toBeTruthy();

    const history = await request(app.getHttpServer())
      .get(`/diagnosis/history/${consentedDate}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const entry = history.body.diagnoses.find(
      (d: { id: string }) => d.id === consentedDiagnosisId,
    );
    expect(entry).toBeDefined();
    expect(entry.image).toBeNull();
    expect(entry.landmarks).toBeNull();
  });
});
