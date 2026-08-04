 import { Module } from '@nestjs/common';
 import { NotificationController } from './notification.controller';
 import { NotificationService } from './notification.service';
 
 /**
  * NotificationModule — T11 알림 설정 저장.
  *
  * NotificationPreference 1 row-per-user 보장과 조회·수정 API를 담당한다.
  * PrismaService(PrismaModule 전역)만 주입받는다.
  * 이번 단계에서는 DB 저장만 구현하고 푸시 발송·WebSocket/SSE는 포함하지 않는다.
  */
 @Module({
   controllers: [NotificationController],
   providers: [NotificationService],
   exports: [NotificationService],
 })
 export class NotificationModule {}
 
