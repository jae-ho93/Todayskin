/**
 * prisma/seed-demo.ts — 데모 테스트 계정 시드 (N66).
 *
 * 해커톤 데모용 고정 계정 010-0000-0000을 만들고, 기록/캘린더 탭에 보일
 * 진단 데이터를 **8/10 ~ 8/17 하루 하나씩 8건** 채운다.
 *
 * - 010-0000-0000 전용 (다른 계정 데이터는 건드리지 않는다)
 * - 멱등: 기존 데모 진단(demo-dx-*)·이미지·추천·날씨를 먼저 정리하고 재생성.
 *   upsert가 아니라 정리+생성인 이유는 진단별로 이미지/부위 지표가
 *   N건이라 교체가 깔끔하지 않기 때문.
 * - 진단 이미지는 이미 S3에 업로드된 파일을 참조한다:
 *   s3://todayskin-images-prod/diagnoses/1/demo-dx-{date}/front-demo.jpg
 * - 랜드마크·진단 결과는 데모용으로 채운다 (실제 촬영 데이터로 자연 교체).
 *
 * 실행: npx tsx prisma/seed-demo.ts
 */
import 'dotenv/config';
import { PrismaClient, DiagnosisStatus, EvidenceGrade } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const DEMO_PHONE = '01000000000';
const DEMO_NAME = '데모 사용자';
/** 데모 진단 id 접두사 — 이 접두사로 기존 데모 데이터를 식별해 정리한다. */
const DEMO_ID_PREFIX = 'demo-dx-';
const S3_BUCKET = 'todayskin-images-prod';

/** 부위별 지표 템플릿 — 날짜마다 수분/탄력에 변동을 준다. */
const PARTS: Array<{ part: 'forehead' | 'glabella' | 'eyeArea' | 'cheek' | 'lips' | 'jaw'; label: string; grade: string; moisture: number; elasticity: number; note: string }> = [
  { part: 'forehead', label: '이마', grade: 'B', moisture: 42, elasticity: 55, note: '약간 건조한 편이에요.' },
  { part: 'glabella', label: '미간', grade: 'A', moisture: 58, elasticity: 62, note: '전반적으로 안정적이에요.' },
  { part: 'eyeArea', label: '눈가', grade: 'B', moisture: 38, elasticity: 48, note: '눈가 주름이 신경 쓰여요.' },
  { part: 'cheek', label: '볼', grade: 'C', moisture: 31, elasticity: 45, note: '볼이 가장 건조해요. 보습이 필요해요.' },
  { part: 'lips', label: '입술', grade: 'B', moisture: 40, elasticity: 50, note: '입술 각질이 보여요.' },
  { part: 'jaw', label: '턱', grade: 'A', moisture: 52, elasticity: 58, note: '모공이 약간 보이지만 양호해요.' },
];

/** 8/10 ~ 8/17 하루 하나 — 날씨·점수·추천 문구를 날짜별로 다르게. */
const DAYS: Array<{ date: string; overall: number; weather: 'sunny' | 'humid' | 'dry' | 'rainy'; title: string; explanation: string; tag: string }> = [
  { date: '2026-08-10', overall: 72, weather: 'rainy', title: '습한 날씨에 답답한 피부', explanation: '장마 뒤 습도가 높아 모공이 답답해 보여요. 산뜻한 젤 타입 보습이 잘 맞아요.', tag: '수분 젤' },
  { date: '2026-08-11', overall: 74, weather: 'sunny', title: '강한 자외선 노출 주의', explanation: '자외선 지수가 높아 자외선 차단이 중요한 날이에요. 선크림을 꼼꼼히 발라주세요.', tag: '자외선 차단' },
  { date: '2026-08-12', overall: 71, weather: 'humid', title: '볼 부위 건조 신호', explanation: '습도가 높은데도 볼 수분이 낮아요. 세라마이드 크림으로 장벽을 채워주세요.', tag: '세라마이드' },
  { date: '2026-08-13', overall: 76, weather: 'dry', title: '건조한 날씨에 수분 급감', explanation: '대기 중 미세먼지가 높고 건조해서 피부가 당겨요. 히알루론산 앰플을 추천해요.', tag: '히알루론산' },
  { date: '2026-08-14', overall: 75, weather: 'sunny', title: '일광 노출 후 진정 케어', explanation: '야외 활동 후 붉어짐이 관찰돼요. 판테놀 성분으로 진정 케어를 해주세요.', tag: '진정 케어' },
  { date: '2026-08-15', overall: 78, weather: 'humid', title: '전반적으로 안정된 상태', explanation: '수분·탄력이 전반적으로 회복됐어요. 지금 루틴을 유지하면 좋아요.', tag: '유지 루틴' },
  { date: '2026-08-16', overall: 80, weather: 'sunny', title: '피부 상태 최고점', explanation: '2주 케어의 성과가 보이는 상태예요. 볼 수분이 크게 개선됐어요.', tag: '개선 확인' },
  { date: '2026-08-17', overall: 81, weather: 'sunny', title: '오늘의 피부 상태', explanation: '오늘도 좋은 상태를 유지하고 있어요. 자외선 차단만 잊지 마세요.', tag: '오늘의 케어' },
];

async function seed(): Promise<void> {
  console.log(`[seed-demo] 데모 계정 시드 시작 (${DEMO_PHONE})`);

  // 1) 사용자 upsert
  const user = await prisma.user.upsert({
    where: { phoneNumber: DEMO_PHONE },
    update: { name: DEMO_NAME },
    create: {
      phoneNumber: DEMO_PHONE,
      name: DEMO_NAME,
      birthDate: new Date('1996-05-14'),
    },
  });
  console.log(`[seed-demo] 사용자 준비: id=${user.id}`);

  // 2) 기존 데모 데이터 정리 (멱등).
  //    추천은 id가 demo-rec-* 로 별도 — 진단 cascade에 안 걸리므로 먼저 지운다.
  //    (진단 삭제 시 이미지·부위 지표는 cascade, 추천의 diagnosisId는 SetNull)
  const oldRecs = await prisma.recommendation.findMany({
    where: { userId: user.id, id: { startsWith: 'demo-rec-' } },
    select: { id: true },
  });
  if (oldRecs.length) {
    await prisma.recommendationProduct.deleteMany({
      where: { recommendationId: { in: oldRecs.map((r) => r.id) } },
    });
    await prisma.recommendation.deleteMany({
      where: { userId: user.id, id: { startsWith: 'demo-rec-' } },
    });
    console.log(`[seed-demo] 기존 데모 추천 ${oldRecs.length}건 정리`);
  }
  const old = await prisma.diagnosis.findMany({
    where: { userId: user.id, id: { startsWith: DEMO_ID_PREFIX } },
    select: { id: true },
  });
  if (old.length) {
    await prisma.diagnosis.deleteMany({
      where: { userId: user.id, id: { startsWith: DEMO_ID_PREFIX } },
    });
    console.log(`[seed-demo] 기존 데모 진단 ${old.length}건 정리`);
  }
  // S3 객체는 키가 고정이라 재업로드 불필요 (같은 키로 덮어씀).

  // 3) 8/10 ~ 8/17 하루 하나씩 진단 생성
  for (const d of DAYS) {
    const capturedAt = new Date(`${d.date}T09:30:00+09:00`);
    const diagnosisId = `${DEMO_ID_PREFIX}${d.date}`;

    // 날씨 스냅샷
    const weather = await prisma.weatherSnapshot.create({
      data: {
        observedAt: capturedAt,
        collectedAt: capturedAt,
        regionName: '서울',
        cityName: '서울특별시',
        districtName: '마포구',
        latitude: 37.5665,
        longitude: 126.978,
        kmaAreaNo: '1111000000',
        uvIndex: d.weather === 'sunny' ? 6.2 : d.weather === 'rainy' ? 1.8 : 3.1,
        uvStatus: d.weather === 'sunny' ? 'high' : 'moderate',
        pm25: d.weather === 'dry' ? 42 : d.weather === 'rainy' ? 14 : 22,
        pm25Status: d.weather === 'dry' ? 'moderate' : 'good',
        pm10: d.weather === 'dry' ? 55 : d.weather === 'rainy' ? 20 : 31,
        pm10Status: d.weather === 'dry' ? 'moderate' : 'good',
        temperature: d.weather === 'humid' ? 29.4 : d.weather === 'sunny' ? 31.2 : d.weather === 'rainy' ? 25.3 : 27.8,
        humidity: d.weather === 'humid' ? 76 : d.weather === 'dry' ? 41 : d.weather === 'rainy' ? 88 : 58,
        source: 'LIVE',
      },
    });

    // 진단
    const diagnosis = await prisma.diagnosis.create({
      data: {
        id: diagnosisId,
        userId: user.id,
        capturedAt,
        overallScore: d.overall,
        status: DiagnosisStatus.COMPLETED,
        modelVersion: 'demo-seed-1.0',
        weatherSnapshotId: weather.id,
        wentOutside: true,
        thumbnailUri: `s3://${S3_BUCKET}/diagnoses/${user.id}/${diagnosisId}/front-demo.jpg`,
        landmarks: {
          version: 'demo',
          points: [
            [0.3, 0.35], [0.5, 0.3], [0.7, 0.35],
            [0.32, 0.5], [0.5, 0.55], [0.68, 0.5],
          ],
        },
        acneReport: d.tag === '진정 케어'
          ? '볼 부위에 가벼운 붉은 기가 관찰되지만, 활성 여드름은 없습니다.'
          : '활성 여드름이 없는 안정적인 상태입니다.',
        diseaseClassification: { label: '정상', confidence: 0.94 },
      },
    });

    // 진단 이미지 (S3에 이미 업로드된 파일 참조)
    await prisma.diagnosisImage.create({
      data: {
        diagnosisId,
        userId: user.id,
        s3Bucket: S3_BUCKET,
        s3Key: `diagnoses/${user.id}/${diagnosisId}/front-demo.jpg`,
        contentType: 'image/jpeg',
        sizeBytes: 143513,
        checksumSha256: null,
        encryption: 'AES256',
      },
    });

    // 부위별 지표 — 날짜별 수분 변동
    const drift = (d.overall - 76) / 2; // -2 ~ +2.5
    for (const p of PARTS) {
      await prisma.skinMetric.create({
        data: {
          diagnosisId,
          part: p.part,
          label: p.label,
          grade: p.grade,
          moisture: Math.max(20, Math.round(p.moisture + drift * 1.5)),
          elasticity: Math.max(20, Math.round(p.elasticity + drift)),
          note: p.note,
        },
      });
    }

    // 추천 1건
    const rec = await prisma.recommendation.create({
      data: {
        id: `demo-rec-${d.date}`,
        userId: user.id,
        diagnosisId,
        title: d.title,
        grade: EvidenceGrade.B,
        sourceLabel: 'AI 추천',
        sourceIds: [],
        explanation: d.explanation,
        observationalNote: d.tag,
        ingredientTags: [d.tag],
        timing: '아침·저녁',
      },
    });

    // 추천에 제품 연결 (시드 카탈로그에서)
    const products = await prisma.product.findMany({ take: 3, orderBy: { createdAt: 'asc' } });
    for (let i = 0; i < products.length; i++) {
      await prisma.recommendationProduct
        .create({
          data: {
            recommendationId: rec.id,
            productId: products[i].id,
            displayOrder: i,
          },
        })
        .catch(() => undefined); // 중복 무시
    }

    console.log(`[seed-demo] ${d.date}: overall=${d.overall}, 부위 6개·이미지·추천 연결 완료`);
  }

  console.log('[seed-demo] 완료 — 8/10~8/17 진단 8건');
}

seed()
  .catch((e) => {
    console.error('[seed-demo] 실패:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
