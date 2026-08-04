 import { Injectable, Logger } from '@nestjs/common';
 import { PrismaService } from '../../prisma/prisma.service';
 import { NotificationPreferenceDto, UpdateNotificationPreferenceDto } from './dto/notification-preference.dto';
 import { NOTIFICATION_DEFAULTS } from './enums/notification-defaults';
 
 /**
  * NotificationService — 알림 설정 저장 (T11).
  *
  * 사용자별 NotificationPreference 1 row를 보장하고 조회·수정 API를 제공한다.
  * 이번 단계에서는 DB 저장만 구현한다. 푸시 발송과 WebSocket/SSE는 포함하지 않는다.
  *
  * 소유권: USER는 자기 설정만 조회·수정할 수 있다.
  * Controller에서 JwtAuthGuard로 인증된 사용자만 접근하고,
  * 서비스는 userId를 인자로 받아 해당 사용자의 설정만 다룬다.
  *
  * 기본값 정책:
  * - DB에 row가 없으면 기본값(NOTIFICATION_DEFAULTS)을 응답으로 반환한다.
  * - PUT 시 row가 없으면 기본값에서 시작해 전달된 필드만 갱신한 뒤 upsert로 저장한다.
  *   (userId에 unique 제약이 있으므로 upsert는 동일 사용자 1 row를 보장한다.)
  * - 프론트 동기화: 프론트가 로컬 상태를 유지하더라도 서버 응답을 기준으로 덮어쓴다.
  */
 @Injectable()
 export class NotificationService {
   private readonly logger = new Logger(NotificationService.name);
 
   constructor(private readonly prisma: PrismaService) {}
 
   /**
   * 사용자 알림 설정 조회.
   * row가 없으면 DB에 생성하지 않고 기본값을 응답으로 반환한다(읽기 부작용 방지).
   */
   async getPreference(userId: number): Promise<NotificationPreferenceDto> {
     const row = await this.prisma.notificationPreference.findUnique({
       where: { userId },
     });
 
     if (!row) {
       return {
         userId,
         ...NOTIFICATION_DEFAULTS,
       };
     }
 
     return this.toDto(row);
   }
 
   /**
   * 사용자 알림 설정 부분 갱신.
   * row가 없으면 기본값에서 시작해 upsert로 1 row를 보장한다.
   * userId에 unique 제약이 있으므로 중복 row가 생성되지 않는다.
   */
   async updatePreference(
   userId: number,
   dto: UpdateNotificationPreferenceDto,
   ): Promise<NotificationPreferenceDto> {
     const current = await this.prisma.notificationPreference.findUnique({
       where: { userId },
     });
 
     // row가 없으면 기본값에서 시작. 전달된 필드만 덮어쓴다.
     const base = current ?? {
       userId,
       ...NOTIFICATION_DEFAULTS,
     };
 
     const next = {
       pushEnabled: dto.pushEnabled ?? base.pushEnabled,
       uvAlertEnabled: dto.uvAlertEnabled ?? base.uvAlertEnabled,
       dustAlertEnabled: dto.dustAlertEnabled ?? base.dustAlertEnabled,
       morningReminder: dto.morningReminder ?? base.morningReminder,
     };
 
     const row = await this.prisma.notificationPreference.upsert({
       where: { userId },
       update: next,
       create: { userId, ...next },
     });
 
     this.logger.log(`알림 설정 갱신: userId=${userId}`);
     return this.toDto(row);
   }
 
   private toDto(row: {
     userId: number;
     pushEnabled: boolean;
     uvAlertEnabled: boolean;
     dustAlertEnabled: boolean;
     morningReminder: boolean;
     updatedAt: Date;
   }): NotificationPreferenceDto {
     return {
       userId: row.userId,
       pushEnabled: row.pushEnabled,
       uvAlertEnabled: row.uvAlertEnabled,
       dustAlertEnabled: row.dustAlertEnabled,
       morningReminder: row.morningReminder,
       updatedAt: row.updatedAt.toISOString(),
     };
   }
 }
