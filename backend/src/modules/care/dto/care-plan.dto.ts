import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 케어 시스템이 다루는 세 가지 근거 유형. */
export type CareType = 'weather' | 'skin' | 'combined';

export const CARE_TYPES: readonly CareType[] = ['weather', 'skin', 'combined'];

export const CARE_EVIDENCE_SOURCE_TYPES = [
  'WHO',
  'FDA',
  '식약처',
  'AAD',
  'PubMed',
  '없음',
] as const;
export type CareEvidenceSourceType = (typeof CARE_EVIDENCE_SOURCE_TYPES)[number];

/**
 * 근거 출처 — web_search로 실제 확인된 것만. `sourceType: '없음'`이면 근거 없이
 * 일반 피부과학 지식에 기반했다는 뜻이고, 이때 name/url은 없다.
 */
export class CareEvidenceDto {
  @ApiPropertyOptional({ description: '출처 기관/문서명', nullable: true })
  sourceName?: string | null;

  @ApiPropertyOptional({ description: 'web_search로 확인된 실제 URL', nullable: true })
  sourceUrl?: string | null;

  @ApiProperty({ enum: CARE_EVIDENCE_SOURCE_TYPES, example: 'WHO' })
  sourceType!: CareEvidenceSourceType;
}

/** 케어 루틴 한 단계 — 성분/사용량 중심. */
export class CareRoutineStepDto {
  @ApiProperty({ description: '단계 구분 (예: 세안 후, 외출 전, 자기 전)' })
  phase!: string;

  @ApiProperty({ description: '무엇을 하는 단계인지' })
  step!: string;

  @ApiPropertyOptional({ description: '핵심 성분', nullable: true })
  ingredient?: string | null;

  @ApiPropertyOptional({ description: '바르는 양 (예: 500원 동전 크기)', nullable: true })
  amount?: string | null;

  @ApiProperty({ description: '오늘 수치/피부상태 기반 이유' })
  reason!: string;

  @ApiPropertyOptional({ type: CareEvidenceDto, nullable: true })
  evidence?: CareEvidenceDto | null;
}

/** 실제 구매 가능한 제품 — 이름/링크는 web_search로 확인된 것만. */
export class CareProductDto {
  @ApiProperty({ description: '실제 제품명' })
  name!: string;

  @ApiProperty({ description: 'web_search로 확인된 구매 페이지 URL' })
  url!: string;

  @ApiProperty({ description: '이 제품을 고른 이유' })
  reason!: string;

  @ApiPropertyOptional({ type: CareEvidenceDto, nullable: true })
  evidence?: CareEvidenceDto | null;
}

export class CarePlanDto {
  @ApiProperty({ enum: CARE_TYPES })
  careType!: CareType;

  @ApiProperty({ type: [CareRoutineStepDto] })
  routine!: CareRoutineStepDto[];

  @ApiProperty({ type: [CareProductDto] })
  products!: CareProductDto[];

  @ApiPropertyOptional({ nullable: true, description: '의료 면책 문구' })
  medicalDisclaimer?: string | null;
}

/** GET/POST /care/* 빠른 경로 공통 응답 — FastPathCoordinator 결과를 그대로 감싼다. */
export class CarePlanFastResponseDto {
  @ApiProperty({ enum: ['CACHED', 'FALLBACK', 'LIVE'], example: 'FALLBACK' })
  source!: 'CACHED' | 'FALLBACK' | 'LIVE';

  @ApiPropertyOptional({ description: 'LIVE 교체용 job id' })
  jobId?: string;

  @ApiPropertyOptional({ description: '이 결과가 만들어진 시각' })
  generatedAt?: string;

  @ApiProperty({ type: CarePlanDto })
  plan!: CarePlanDto;
}
