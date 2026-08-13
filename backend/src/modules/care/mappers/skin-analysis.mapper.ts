import { Diagnosis, Prisma, SkinMetric } from '@prisma/client';

/**
 * Diagnosis + SkinMetric[] → OpenAI 입력용 plain object.
 *
 * 사용자가 준 스펙의 snake_case 스키마(`forehead.hydration` 등)로 변환하지 않는다.
 * 실제 DB 구조를 그대로 넘기고 프롬프트에서 필드 의미를 설명한다 — 존재하지 않는
 * 변환 계층을 만들지 않는다.
 */
export function diagnosisToSkinInput(
  diagnosis: Diagnosis,
  metrics: SkinMetric[],
): Record<string, unknown> {
  return {
    capturedAt: diagnosis.capturedAt.toISOString(),
    overallScore: diagnosis.overallScore,
    parts: metrics.map((m) => ({
      part: m.part,
      label: m.label,
      grade: m.grade,
      moisture: m.moisture,
      elasticity: m.elasticity,
    })),
    // YOLO 여드름 구역 리포트(있으면). 바운딩 박스 없이 한글 문장.
    acneReport: diagnosis.acneReport ?? null,
    // 5클래스(건선/아토피/주사/지루/정상) 질환 분류. "~의심" 접미사 없음 — 소프트닝은
    // 프롬프트 출력 단계에서 지시한다.
    diseaseClassification: toDiseaseClassification(diagnosis.diseaseClassification),
  };
}

function toDiseaseClassification(
  raw: Prisma.JsonValue | null,
): { label: string; confidence: number } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as { label?: unknown; confidence?: unknown };
  if (typeof obj.label !== 'string' || typeof obj.confidence !== 'number') return null;
  return { label: obj.label, confidence: obj.confidence };
}
