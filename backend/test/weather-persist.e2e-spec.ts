import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { KmaClient } from '../src/modules/weather/clients/kma.client';
import { AirKoreaClient } from '../src/modules/weather/clients/airkorea.client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * 날씨 이력 저장 통합 테스트 (T6).
 * 실제 PostgreSQL(test DB)에 WeatherSnapshot이 저장되는지 검증한다.
 * 외부 API(KMA/AirKorea)는 mock으로 대체해 데이터 일관성을 보장한다.
 *
 * DATABASE_URL=test DB가 필요. 없으면 스킵.
 */
describe('WeatherSnapshot 영구 저장 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let kmaClient: { fetchUvIndex: jest.Mock };
  let airKoreaClient: { fetchAirQuality: jest.Mock };

  const hasDb = !!process.env.DATABASE_URL;
  const itOrSkip = hasDb ? it : it.skip;

  beforeAll(async () => {
    if (!hasDb) return;

    kmaClient = { fetchUvIndex: jest.fn() };
    airKoreaClient = { fetchAirQuality: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KmaClient)
      .useValue(kmaClient)
      .overrideProvider(AirKoreaClient)
      .useValue(airKoreaClient)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);
    await prisma.weatherSnapshot.deleteMany({});
  });

  afterAll(async () => {
    if (!hasDb) return;
    await prisma.weatherSnapshot.deleteMany({});
    await app.close();
  });

  itOrSkip('LIVE 데이터 수집 시 WeatherSnapshot이 DB에 저장된다', async () => {
    const observed = new Date('2026-08-04T06:30:00Z');
    kmaClient.fetchUvIndex.mockResolvedValue({
      current: 7,
      peak: 9,
      peakHour: 13,
      observedAt: new Date('2026-08-04T06:00:00Z'),
    });
    airKoreaClient.fetchAirQuality.mockResolvedValue({
      ozone: 0.05,
      pm25: 20,
      pm10: 45,
      cai: 60,
      no2: 0.02,
      so2: 0.005,
      co: 0.4,
      observedAt: observed,
    });

   const res = await request(app.getHttpServer())
     .get('/weather?lat=37.5665&lon=126.978');
    expect(res.status).toBe(200);

    expect(res.body.source).toBe('LIVE');
    expect(res.body.uvIndex).toBe(7);

    const rows = await prisma.weatherSnapshot.findMany({});
    expect(rows.length).toBe(1);
    expect(rows[0].uvIndex).toBe(7);
   expect(rows[0].pm25).toBe(20);
    expect(rows[0].regionName).toBe('서울특별시');
    expect(rows[0].latitude).toBe(37.5665);
    expect(rows[0].source).toBe('LIVE');
    // 관측 시각은 더 최근(air) 사용
    expect(rows[0].observedAt.toISOString()).toBe(observed.toISOString());
    // 수집 시각은 now()이므로 존재
    expect(rows[0].collectedAt).toBeInstanceOf(Date);
  });

  itOrSkip('동일 관측 시각 재요청 시 중복 row가 생기지 않는다', async () => {
    const observed = new Date('2026-08-04T07:00:00Z');
    kmaClient.fetchUvIndex.mockResolvedValue({
      current: 5,
      peak: null,
      peakHour: null,
      observedAt: observed,
    });
    airKoreaClient.fetchAirQuality.mockResolvedValue({
      ozone: null,
      pm25: 10,
      pm10: null,
      cai: null,
      no2: null,
      so2: null,
      co: null,
      observedAt: observed,
    });

    await request(app.getHttpServer()).get('/weather').expect(200);
    await request(app.getHttpServer()).get('/weather').expect(200);

    const rows = await prisma.weatherSnapshot.findMany({
      where: { pm25: 10 },
    });
    expect(rows.length).toBe(1);
  });

  itOrSkip('UNAVAILABLE(모든 지표 null)은 저장되지 않는다', async () => {
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

    const rows = await prisma.weatherSnapshot.findMany({});
    // 앞선 두 테스트의 row만 존재 (이 케이스는 저장 안 함)
    expect(rows.length).toBeLessThanOrEqual(2);
  });
});
