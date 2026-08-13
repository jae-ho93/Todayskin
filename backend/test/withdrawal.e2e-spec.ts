import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { SoftDeleteService } from '../src/common/soft-delete/soft-delete.service';
import { KmaClient } from '../src/modules/weather/clients/kma.client';
import { AirKoreaClient } from '../src/modules/weather/clients/airkorea.client';
import { StationClient } from '../src/modules/weather/clients/station.client';
import { RedisService } from '../src/redis/redis.service';
import { signupWithOtp } from './helpers/auth-flow';
import { grantConsent, grantDiagnosisProcessing } from './helpers/consent-flow';
import { ConsentPurpose } from '../src/modules/consent/enums/consent-purpose.enum';
import { IMAGE_OBJECT_STORE } from '../src/modules/storage/providers/image-object-store.interface';
import { MemoryImageObjectStore } from '../src/modules/storage/providers/memory-image-object-store';

/**
 * N44: 탈퇴 시 진단 결과 완전 삭제 e2e.
 *
 * 구 정책은 진단을 익명화해 보존했다. 화면에서만 사라지고 DB에는 남으므로
 * "탈퇴 시 즉시 파기"라는 처리방침과 어긋났다. 잔존 row가 0임을 여기서 고정한다.
 */
describe('Withdrawal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let softDelete: SoftDeleteService;
  let accessToken: string;
  let userId: number;
  let memoryStore: MemoryImageObjectStore;

  const testPhone = '01077770044';

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
    process.env.MOCK_OPENAI = 'true';
    process.env.OTP_ALLOWLIST_PHONES = testPhone;
    process.env.S3_BUCKET = '';

    memoryStore = new MemoryImageObjectStore('todayskin-e2e-n44');

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
          failed: false,
        }),
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
    softDelete = app.get(SoftDeleteService);
    await app.init();
    await prisma.$connect();

    await prisma.user.deleteMany({ where: { phoneNumber: testPhone } });

    const signup = await signupWithOtp(app, testPhone, {
      name: 'N44탈퇴',
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
      await prisma.recommendation.deleteMany({ where: { userId } });
      await prisma.diagnosis.deleteMany({ where: { userId } });
      await prisma.consentRecord.deleteMany({ where: { userId } });
      await prisma.refreshSession.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  let s3Key: string;

  it('탈퇴 전에는 진단·이미지·추천이 남아 있다', async () => {
    const submit = await request(app.getHttpServer())
      .post('/diagnosis')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('front', JPEG_1x1, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/recommendations/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ diagnosisId: submit.body.id })
      .expect((res) => {
        if (![200, 201].includes(res.status)) {
          throw new Error(`추천 생성 실패: ${res.status} ${JSON.stringify(res.body)}`);
        }
      });

    const image = await prisma.diagnosisImage.findUnique({
      where: { diagnosisId: submit.body.id as string },
    });
    expect(image).toBeTruthy();
    s3Key = image!.s3Key;
    expect(memoryStore.has(s3Key)).toBe(true);
    expect(await prisma.recommendation.count({ where: { userId } })).toBeGreaterThan(0);
  });

  it('탈퇴 즉시 진단·부위 점수·이미지·추천이 DB에서 사라진다', async () => {
    await request(app.getHttpServer())
      .post('/auth/withdraw')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(200);

    expect(await prisma.diagnosis.count({ where: { userId } })).toBe(0);
    expect(await prisma.diagnosisImage.count({ where: { userId } })).toBe(0);
    expect(await prisma.recommendation.count({ where: { userId } })).toBe(0);
    expect(await prisma.skinMetric.count({ where: { diagnosis: { userId } } })).toBe(0);
    // 익명 보존이 아니라 물리 삭제 — userId만 떼어낸 행도 남지 않아야 한다.
    expect(await prisma.diagnosis.count({ where: { userId: null } })).toBe(0);
    expect(memoryStore.has(s3Key)).toBe(false);
  });

  it('계정 껍데기는 PII가 스크럽된 채 purgeAfter까지 남는다', async () => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user).toBeTruthy();
    expect(user!.deletedAt).toBeTruthy();
    expect(user!.purgeAfter).toBeTruthy();
    expect(user!.name).toBe('deleted');
    expect(user!.phoneNumber).not.toBe(testPhone);
  });

  it('탈퇴 후 기존 토큰으로는 조회할 수 없다', async () => {
    await request(app.getHttpServer())
      .get('/diagnosis/history')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('purge가 지나면 계정 row도 사라지고 잔존 행이 0이다', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { purgeAfter: new Date(Date.now() - 1000) },
    });

    const result = await softDelete.purgeExpired();
    expect(result.usersPurged).toBeGreaterThanOrEqual(1);

    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prisma.diagnosis.count({ where: { userId } })).toBe(0);
    expect(await prisma.recommendation.count({ where: { userId } })).toBe(0);
  });
});
