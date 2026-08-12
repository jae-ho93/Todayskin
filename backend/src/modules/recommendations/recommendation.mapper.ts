import {
  RecommendationTemplate,
  Recommendation as RecommendationModel,
} from '@prisma/client';
import { EvidenceGrade } from './enums/evidence-grade.enum';
import { RecommendationDto, RecommendationTiming } from './dto/recommendation.dto';
import { resolveEvidenceSources } from './content/evidence-sources';
import {
  metricsFromSnapshot,
  PrismaWeatherMetrics,
} from '../weather/mappers/weather-snapshot.mapper';

/**
 * R7: 엔티티 → DTO 변환. 순수 함수라 Prisma·Gemini 목킹 없이 검증할 수 있다.
 *
 * `grade`/`timing`은 Prisma가 string으로 주고 계약은 유니온 타입이라 이 경계에서만
 * 좁힌다. 서비스 곳곳에서 캐스팅하면 어디가 실제 경계인지 알 수 없게 된다.
 */

export function templateToDto(
  t: RecommendationTemplate,
  relatedProductIds: string[] = [],
): RecommendationDto {
  return {
    id: t.id,
    title: t.title,
    grade: t.grade as EvidenceGrade,
    sourceLabel: t.sourceLabel,
    sources: resolveEvidenceSources(t.sourceIds),
    explanation: t.explanation,
    observationalNote: t.observationalNote,
    ingredientTags: t.ingredientTags,
    relatedProductIds,
    timing: (t.timing as RecommendationTiming | null) ?? null,
  };
}

export function modelToDto(
  r: RecommendationModel,
  relatedProductIds: string[] = [],
): RecommendationDto {
  return {
    id: r.id,
    title: r.title,
    grade: r.grade as EvidenceGrade,
    sourceLabel: r.sourceLabel,
    // 사용자별 생성 추천(B·C)은 참조 문서가 없다. 빈 배열이 "인용 없음"의 표현이다.
    sources: [],
    explanation: r.explanation,
    observationalNote: r.observationalNote,
    ingredientTags: r.ingredientTags,
    relatedProductIds,
    timing: (r.timing as RecommendationTiming | null) ?? null,
  };
}

/** WeatherSnapshot Prisma 모델을 Gemini 입력용 plain 객체로 변환. */
export function snapshotToInput(
  s: PrismaWeatherMetrics & { observedAt: Date; regionName: string },
): Record<string, unknown> {
  return {
    observedAt: s.observedAt,
    regionName: s.regionName,
    ...metricsFromSnapshot(s),
  };
}
