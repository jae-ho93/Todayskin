import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CareEvidenceDto } from './care-plan.dto';

export class CareWeatherQueryDto {
  @ApiPropertyOptional({ description: '위도 (-90 ~ 90)', example: 37.5665 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: '경도 (-180 ~ 180)', example: 126.978 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon?: number;

  @ApiPropertyOptional({ description: '직전 결과를 무시하고 새로 생성' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  refresh?: boolean;
}

/**
 * "다른 추천 보기" — 제품만 새로 생성할 때 클라이언트가 화면에 이미 떠 있는 루틴을
 * 그대로 돌려보낸다. 서버는 이걸 LLM 프롬프트 컨텍스트로만 쓰고 절대 다시 만들지
 * 않는다 — 그래서 검증도 가볍게(모양만) 한다. sourceType 화이트리스트 등 실제
 * 신뢰 검증은 최초 생성 시(normalizeGeneratedCarePlan)에 이미 끝났다.
 */
export class CareRoutineStepInputDto {
  @IsString()
  phase!: string;

  @IsString()
  step!: string;

  @IsOptional()
  ingredient?: string | null;

  @IsOptional()
  amount?: string | null;

  @IsString()
  reason!: string;

  @IsOptional()
  detail?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CareEvidenceDto)
  evidence?: CareEvidenceDto | null;
}

export class CareDiagnosisRequestDto {
  @ApiPropertyOptional({ description: '이 진단 기준으로 생성' })
  @IsString()
  diagnosisId!: string;

  @ApiPropertyOptional({ description: '직전 결과를 무시하고 새로 생성' })
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;

  @ApiPropertyOptional({
    type: [CareRoutineStepInputDto],
    description:
      '화면에 이미 떠 있는 루틴 — 있으면 routine은 재생성하지 않고 products만 새로 찾는다.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CareRoutineStepInputDto)
  routine?: CareRoutineStepInputDto[];

  @ApiPropertyOptional({ description: 'routine과 함께 그대로 유지할 의료 면책 문구', nullable: true })
  @IsOptional()
  medicalDisclaimer?: string | null;
}

/** "다음날 아침" — 최신 진단의 피부 상태 + 오늘 실시간 날씨(좌표) 조합. */
export class CareMorningRequestDto {
  @ApiPropertyOptional({ description: '이 진단의 피부 상태를 기준으로 생성' })
  @IsString()
  diagnosisId!: string;

  @ApiPropertyOptional({ description: '위도 (-90 ~ 90)', example: 37.5665 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ description: '경도 (-180 ~ 180)', example: 126.978 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon?: number;

  @ApiPropertyOptional({ description: '직전 결과를 무시하고 새로 생성' })
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;

  @ApiPropertyOptional({
    type: [CareRoutineStepInputDto],
    description:
      '화면에 이미 떠 있는 루틴 — 있으면 routine은 재생성하지 않고 products만 새로 찾는다.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CareRoutineStepInputDto)
  routine?: CareRoutineStepInputDto[];

  @ApiPropertyOptional({ description: 'routine과 함께 그대로 유지할 의료 면책 문구', nullable: true })
  @IsOptional()
  medicalDisclaimer?: string | null;
}
