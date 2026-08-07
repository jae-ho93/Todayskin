import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * 진단 제출 시 선택적 위치 좌표 + 촬영 전 외출 여부.
 * 프론트 위치 권한 허용 시 lat/lon을 보내면 해당 지역 날씨 스냅샷을 연결하고,
 * 미전송 시 서버 기본 지역 스냅샷을 연결한다.
 * 외부 API가 unavailable이어도 환경 데이터 부재가 진단 자체를 실패시키지는 않는다.
 *
 * wentOutside=false(외출 안 함)면 그날의 외부 환경 노출과 무관하므로 날씨 스냅샷을
 * 아예 연결하지 않는다 — 실내에만 있었는데 그 시각 날씨를 피부 상태와 엮으면 개인 패턴
 * 분석(상관)에 노이즈가 된다.
 */
export class SubmitDiagnosisQueryDto {
  @ApiPropertyOptional({ type: Number, example: 37.57 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ type: Number, example: 126.98 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon?: number;

  @ApiPropertyOptional({
    type: Boolean,
    example: true,
    description: '촬영 전 외출 여부. true일 때만 날씨 스냅샷을 진단에 연결한다. 기본값 false.',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  wentOutside?: boolean;
}
