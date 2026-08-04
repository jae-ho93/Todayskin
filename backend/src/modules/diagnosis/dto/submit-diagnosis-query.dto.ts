import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

/**
 * 진단 제출 시 선택적 위치 좌표.
 * 프론트 위치 권한 허용 시 lat/lon을 보내면 해당 지역 날씨 스냅샷을 연결하고,
 * 미전송 시 서버 기본 지역 스냅샷을 연결한다(또는 연결하지 않는다).
 * 날씨 연결은 선택 사항 — 환경 데이터 부재가 진단 자체를 실패시키지 않는다.
 */
export class SubmitDiagnosisQueryDto {
  @ApiPropertyOptional({ type: Number, example: 37.57 })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ type: Number, example: 126.98 })
  @IsOptional()
  @IsNumber()
  lon?: number;
}
