 import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
 import { IsBoolean, IsOptional } from 'class-validator';
 
 /**
  * NotificationPreference 응답/요청 DTO.
  *
  * 알림 설정은 사용자별 1 row(row-per-user). 설정이 없으면 기본값을 반환한다.
  *
  * T11에서는 DB 저장만 구현한다. 실제 푸시 발송, WebSocket/SSE는 포함하지 않는다.
  */
 export class NotificationPreferenceDto {
   @ApiProperty({ example: 1, description: '사용자 ID' })
   userId!: number;
 
   @ApiProperty({
     example: false,
     description: '푸시 알림 마스터 스위치. 기본 false.',
   })
   pushEnabled!: boolean;
 
   @ApiProperty({
     example: true,
     description: '자외선 경보 알림. 기본 true.',
   })
   uvAlertEnabled!: boolean;
 
   @ApiProperty({
     example: true,
     description: '미세먼지 경보 알림. 기본 true.',
   })
   dustAlertEnabled!: boolean;
 
   @ApiProperty({
     example: false,
     description: '아침 리마인더 알림. 기본 false.',
   })
   morningReminder!: boolean;
 
   @ApiPropertyOptional({
     example: '2026-08-05T10:00:00.000Z',
     description: '최종 수정 시각 (DB에 row가 있을 때만).',
   })
   updatedAt?: string;
 }
 
 /**
  * PUT /notifications/preferences 요청 본문.
  * 모든 필드는 선택이고, 전달된 필드만 부분 갱신한다.
  */
 export class UpdateNotificationPreferenceDto {
   @ApiPropertyOptional({ example: false, description: '푸시 알림 마스터 스위치' })
   @IsOptional()
   @IsBoolean()
   pushEnabled?: boolean;
 
   @ApiPropertyOptional({ example: true, description: '자외선 경보 알림' })
   @IsOptional()
   @IsBoolean()
   uvAlertEnabled?: boolean;
 
   @ApiPropertyOptional({ example: true, description: '미세먼지 경보 알림' })
   @IsOptional()
   @IsBoolean()
   dustAlertEnabled?: boolean;
 
   @ApiPropertyOptional({ example: false, description: '아침 리마인더 알림' })
   @IsOptional()
   @IsBoolean()
   morningReminder?: boolean;
 }
