/**
 * prisma/seed-demo.ts — 데모 테스트 계정 시드 (N66).
 *
 * 해커톤 데모용 고정 계정 010-0000-0000을 만들고, 캘린더·기록 탭에 보일
 * 과거 진단 데이터를 채운다. 실제 촬영 없이도 화면이 꽉 차 보이게 한다.
 *
 * - upsert라 반복 실행해도 중복이 없다 (전화번호 unique 기준).
 * - 진단 이미지(DiagnosisImage)는 만들지 않는다 — 사용자가 사진을 넣으면
 *   그때 연결한다 (S3 키가 필요하므로 시드 단계에선 생략).
 * - 랜드마크는 정규화 좌표 목록 대신 최소 구조를 넣고, 실제 촬영 데이터가
 *   들어오면 자연히 교체된다.
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

/** 데모 계정 이름 — 회원가입 시 사용자가 바꿀 수 있다. */
const DEMO_NAME = '데모 사용자';

/** 부위별 지표 템플릿 — 날짜마다 약간씩 점수를 흔든다. */
const PARTS: Array<{ part: 'forehead' | 'glabella' | 'eyeArea' | 'cheek' | 'lips' | 'jaw'; label: string; grade: string; moisture: number; elasticity: number; note: string }> = [
  { part: 'forehead', label: '이마', grade: 'B', moisture: 42, elasticity: 55, note: '약간 건조한 편이에요.' },
  { part: 'glabella', label: '미간', grade: 'A', moisture: 58, elasticity: 62, note: '전반적으로 안정적이에요.' },
  { part: 'eyeArea', label: '눈가', grade: 'B', moisture: 38, elasticity: 48, note: '눈가 주름이 신경 쓰여요.' },
  { part: 'cheek', label: '볼', grade: 'C', moisture: 31, elasticity: 45, note: '볼이 가장 건조해요. 보습이 필요해요.' },
  { part: 'lips', label: '입술', grade: 'B', moisture: 40, elasticity: 50, note: '입술 각질이 보여요.' },
  { part: 'jaw', label: '턱', grade: 'A', moisture: 52, elasticity: 58, note: '모공이 약간 보이지만 양호해요.' },
];

/**
 * 날짜별 진단 생성. 캘린더에 표시되도록 2주간 하루 걸러 기록을 남긴다.
 */
async function seed() {
  console.log(`[seed-demo] 데모 계정 시드 시작 (${DEMO_PHONE})`);

  // 1) 사용자 upsert
  const user = await prisma.user.upsert({
    where: { phoneNumber: DEMO_PHONE },
    update: {},
    create: {
      phoneNumber: DEMO_PHONE,
      name: DEMO_NAME,
      birthDate: new Date('1996-05-14'),
    },
  });
  console.log(`[seed-demo] 사용자 준비: id=${user.id}`);

  // 2) 과거 진단 5건 — 2026-08-03 ~ 08-17 (하루 걸러)
  const days: Array<{ date: string; overall: number; weather: 'sunny' | 'humid' | 'dry' }> = [
    { date: '2026-08-03', overall: 74, weather: 'sunny' },
    { date: '2026-08-05', overall: 78, weather: 'humid' },
    { date: '2026-08-07', overall: 71, weather: 'dry' },
    { date: '2026-08-09', overall: 76, weather: 'humid' },
    { date: '2026-08-11', overall: 80, weather: 'sunny' },
    { date: '2026-08-13', overall: 79, weather: 'humid' },
    { date: '2026-08-15', overall: 82, weather: 'sunny' },
  ];

  for (const d of days) {
    const capturedAt = new Date(`${d.date}T09:30:00+09:00`);

    // 날씨 스냅샷 (진단마다 별도)
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
        uvIndex: d.weather === 'sunny' ? 6.2 : 3.1,
        uvStatus: d.weather === 'sunny' ? 'high' : 'moderate',
        pm25: d.weather === 'dry' ? 38 : 22,
        pm25Status: d.weather === 'dry' ? 'moderate' : 'good',
        pm10: d.weather === 'dry' ? 52 : 31,
        pm10Status: d.weather === 'dry' ? 'moderate' : 'good',
        temperature: d.weather === 'humid' ? 29.4 : d.weather === 'sunny' ? 31.2 : 27.8,
        humidity: d.weather === 'humid' ? 74 : d.weather === 'dry' ? 41 : 58,
        source: 'LIVE',
      },
    });

    // 진단
    const diagnosis = await prisma.diagnosis.create({
      data: {
        id: `demo-dx-${d.date}`,
        userId: user.id,
        capturedAt,
        overallScore: d.overall,
        status: DiagnosisStatus.COMPLETED,
        modelVersion: 'demo-seed-1.0',
        weatherSnapshotId: weather.id,
        wentOutside: true,
        landmarks: {
          version: 'demo',
          points: [
            [0.3, 0.35], [0.5, 0.3], [0.7, 0.35],
            [0.32, 0.5], [0.5, 0.55], [0.68, 0.5],
          ],
        },
      },
    });

    // 부위별 지표 — 점수에 약간의 변동을 준다
    for (const p of PARTS) {
      const jitter = (d.overall - 76) / 4; // -1.5 ~ +1.5
      await prisma.skinMetric.create({
        data: {
          diagnosisId: diagnosis.id,
          part: p.part,
          label: p.label,
          grade: p.grade,
          moisture: Math.max(20, Math.round(p.moisture + jitter * 2)),
          elasticity: Math.max(20, Math.round(p.elasticity + jitter)),
          note: p.note,
        },
      });
    }

    // 추천 1건 (B등급 — 생성 추천처럼)
    const rec = await prisma.recommendation.create({
      data: {
        id: `demo-rec-${d.date}`,
        userId: user.id,
        diagnosisId: diagnosis.id,
        title: '건조한 볼을 위한 보습 루틴',
        grade: EvidenceGrade.B,
        sourceLabel: 'AI 추천',
        sourceIds: [],
        explanation:
          '볼 부위 수분이 낮아 보습 성분(히알루론산·세라마이드) 중심의 루틴을 추천해요.',
        observationalNote: '실측 수분 30%대 — 크림형 보습제가 잘 맞아요.',
        ingredientTags: ['히알루론산', '세라마이드'],
        timing: '아침·저녁',
      },
    });

    // 추천에 제품 연결 (시드 카탈로그에서)
    const products = await prisma.product.findMany({ take: 3, orderBy: { createdAt: 'asc' } });
    for (let i = 0; i < products.length; i++) {
      await prisma.recommendationProduct.create({
        data: {
          recommendationId: rec.id,
          productId: products[i].id,
          displayOrder: i,
        },
      }).catch(() => undefined); // 중복 무시
    }

    console.log(`[seed-demo] ${d.date}: 진단 overall=${d.overall}, 부위 6개, 추천 연결 완료`);
  }

  console.log('[seed-demo] 완료 — 2주간 진단 7건 + 날씨/추천 시드');
}

seed()
  .catch((e) => {
    console.error('[seed-demo] 실패:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
