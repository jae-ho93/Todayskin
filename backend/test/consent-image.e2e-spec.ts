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
  grantRecommendationTransfer,
} from './helpers/consent-flow';
import { ConsentPurpose } from '../src/modules/consent/enums/consent-purpose.enum';
import { IMAGE_OBJECT_STORE } from '../src/modules/storage/providers/image-object-store.interface';
import { MemoryImageObjectStore } from '../src/modules/storage/providers/memory-image-object-store';

/**
 * N3: Consent + S3(이미지 저장) e2e.
 */
describe('Consent & Image Storage (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: number;
  let memoryStore: MemoryImageObjectStore;

  const testPhone = '01077770003';

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

    memoryStore = new MemoryImageObjectStore('todayskin-e2e');

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

    // migrate may need DiagnosisImage table — assume migrate already applied in CI/local
    const signupRes = await signupWithOtp(app, testPhone, {
      name: '동의테스터',
      birthDate: '1992-02-02',
    });
    expect(signupRes.status).toBe(201);
    accessToken = signupRes.body.accessToken;
    userId = signupRes.body.id;
  });

  afterAll(async () => {
    await prisma.diagnosisImage.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.skinMetric.deleteMany({ where: { diagnosis: { userId } } });
    await prisma.diagnosis.deleteMany({ where: { userId } });
    await prisma.recommendation.deleteMany({ where: { userId } });
    await prisma.consentRecord.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { actorId: userId } });
    await prisma.otpCode.deleteMany({ where: { phoneNumber: testPhone } });
    await prisma.refreshSession.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });
    await app.close();
  });

  it('GET /consents/registry — 3개 purpose 반환', async () => {
    const res = await request(app.getHttpServer())
      .get('/consents/registry')
      .expect(200);
    expect(res.body).toHaveLength(3);
  });

  it('processing 동의 없이 진단 제출 → 403', async () => {
    await request(app.getHttpServer())
      .post('/diagnosis')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('front', JPEG_1x1, 'front.jpg')
      .expect(403);
  });

  it('processing만 동의하고 저장 미동의 → 진단 201, 이미지 미저장', async () => {
    await grantDiagnosisProcessing(app, accessToken);

    const before = memoryStore.size();
    const res = await request(app.getHttpServer())
      .post('/diagnosis')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('front', JPEG_1x1, 'front.jpg')
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.thumbnailUri == null).toBe(true);
    expect(memoryStore.size()).toBe(before);

    const imgCount = await prisma.diagnosisImage.count({
      where: { diagnosisId: res.body.id },
    });
    expect(imgCount).toBe(0);

    // 중복 윈도 정리
    await prisma.skinMetric.deleteMany({
      where: { diagnosisId: res.body.id },
    });
    await prisma.diagnosis.delete({ where: { id: res.body.id } });
  });

  it('storage 동의 후 진단 → 이미지 메타 저장', async () => {
    await grantConsent(app, accessToken, ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE);

    const res = await request(app.getHttpServer())
      .post('/diagnosis')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('front', JPEG_1x1, 'front.jpg')
      .expect(201);

    // BE-2026-08-12: memory 스토어 thumbnailUri는 dev-storage http URL로 발급된다
    expect(res.body.thumbnailUri).toMatch(/^http:\/\/127\.0\.0\.1:3000\/dev-storage\//);
    const img = await prisma.diagnosisImage.findUnique({
      where: { diagnosisId: res.body.id },
    });
    expect(img).toBeTruthy();
    expect(img!.encryption).toBe('AES256');
    expect(img!.deletedAt).toBeNull();
    expect(memoryStore.size()).toBeGreaterThan(0);

    // 철회 → 이미지 삭제
    await request(app.getHttpServer())
      .post('/consents')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        purpose: ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE,
        agreed: false,
      })
      .expect(200);

    const after = await prisma.diagnosisImage.findUnique({
      where: { diagnosisId: res.body.id },
    });
    expect(after!.deletedAt).not.toBeNull();
    const diag = await prisma.diagnosis.findUnique({
      where: { id: res.body.id },
    });
    expect(diag!.thumbnailUri).toBeNull();
  });

  it('transfer 동의 없이 추천 생성 → 403', async () => {
    await request(app.getHttpServer())
      .post('/recommendations/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ skinScore: { overallScore: 70 }, weather: { uvIndex: 3 } })
      .expect(403);
  });

  it('transfer 동의 후 추천 생성 → 200', async () => {
    await grantRecommendationTransfer(app, accessToken);
    const res = await request(app.getHttpServer())
      .post('/recommendations/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ skinScore: { overallScore: 70 }, weather: { uvIndex: 3 } })
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
