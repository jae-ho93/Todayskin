import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

/**
 * PrismaService 테스트 — 실제 PostgreSQL test DB(todayskin_test)에 연결한다.
 *
 * DB 필요 조건: CI는 postgres service가 제공되어 항상 실행된다. 로컬에서 실행하려면
 * postgres를 띄우고 TEST_DATABASE_URL(또는 docker compose의 기본 test DB)을 사용한다.
 * DB가 없으면 로컬 `npm test`가 끊기지 않도록 스위트 전체를 skip한다.
 */
const describeWithDb =
  process.env.CI || process.env.TEST_DATABASE_URL ? describe : describe.skip;
describeWithDb('PrismaService', () => {
  let service: PrismaService;

  beforeAll(async () => {
    // 실제 DB 연결 없이 인스턴스화만 검증하기 위해 DATABASE_URL을 test DB로 설정.
    // test DB는 CI/로컬에서 이미 마이그레이션된 상태여야 한다.
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ??
      'postgresql://todayskin:secret@localhost:5432/todayskin_test';

    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await service?.$disconnect();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('can connect to the database', async () => {
    await expect(service.$connect()).resolves.not.toThrow();
  });

  it('exposes Prisma models (User) for downstream modules', () => {
    expect(service.user).toBeDefined();
    expect(service.recommendationTemplate).toBeDefined();
    expect(service.product).toBeDefined();
    expect(service.weatherSnapshot).toBeDefined();
    expect(service.diagnosis).toBeDefined();
    expect(service.notificationPreference).toBeDefined();
  });

  it('seed templates are queryable', async () => {
    const count = await service.recommendationTemplate.count();
    // T2 seed는 전역 A등급 템플릿 1개를 upsert한다.
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('seed product catalog is queryable', async () => {
    const count = await service.product.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});
